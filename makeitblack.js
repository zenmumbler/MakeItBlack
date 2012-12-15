(function() {
"use strict";

// ----------------------------------------------------------------------------
//        _   _ _ 
//  _   _| |_(_) |
// | | | | __| | |
// | |_| | |_| | |
//  \__,_|\__|_|_|
//                
// ----------------------------------------------------------------------------
var fnRequestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
var clAudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;

function log() {
	console.info.apply(console, arguments);
}

function isArrayLike(x) {
	return (typeof x == "object") && ("length" in x) && (x.constructor != String);
}

function each(vals, handler) {
	var arr = isArrayLike(vals);

	if (arr) {
		for (var ix = 0; ix < vals.length; ++ix) {
			if (! ix in vals)
				continue;
			handler(vals[ix], ix, vals);
		}
	}
	else {
		for (var key in vals)
			handler(vals[key], key, vals);
	}
}

function extend(source, additions) {
	for (var k in additions) {
		if (additions.hasOwnProperty(k))
			source[k] = additions[k];
	}
	return source;
}


// ----------------------------------------------------------------------------
//        _       _           _     
//   __ _| | ___ | |__   __ _| |___ 
//  / _` | |/ _ \| '_ \ / _` | / __|
// | (_| | | (_) | |_) | (_| | \__ \
//  \__, |_|\___/|_.__/ \__,_|_|___/
//  |___/                           
// ----------------------------------------------------------------------------
var STAGE_W = 320, STAGE_H = 192,
	TILE_DIM = 8,
	GRAVITY_SEC = 180;



// ----------------------------------------------------------------------------
//  _                _     
// | | _____   _____| |___ 
// | |/ _ \ \ / / _ \ / __|
// | |  __/\ V /  __/ \__ \
// |_|\___| \_/ \___|_|___/
//                         
// ----------------------------------------------------------------------------
function MapData(name, onLoad) {
	var intf = {
			layers: [],
			width: 0, height: 0
		};

	function LayerData(layerNode) {
		var width, height,
			bytes = atob(layerNode.textContent.trim()).split("").map(function(c) { return c.charCodeAt(0); }),
			tileData = [];

		each(layerNode.attributes, function(attr, ix) {
			if (attr.nodeName == "width")
				width = parseInt(attr.textContent);
			if (attr.nodeName == "height")
				height = parseInt(attr.textContent);
		});

		for (var tix = 0, offset = 0; tix < (width * height); ++tix, offset += 4) {
			var t = bytes[offset + 0] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + ((bytes[offset + 3] & 0x1f) << 24);
			tileData.push(t);
		}

		function rangeOnRow(row, fromCol, tileCount) {
			var offset = (row * width) + fromCol;
			return tileData.slice(offset, offset + tileCount);
		}

		function tileAt(row, col) {
			if (row < 0 || col < 0 || row >= height || col >= width)
				return 1;
			return tileData[(row * width) + col];
		}

		return {
			width: width, height: height,
			rangeOnRow: rangeOnRow, tileAt: tileAt
		}
	}

	function load(done) {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", name + ".tmx?k=" + Date.now());
		xhr.overrideMimeType("application/xml");
		xhr.onload = function() {
			var tileDoc = xhr.responseXML.childNodes[0];

			each(tileDoc.attributes, function(attr, ix) {
				if (attr.nodeName == "width")
					intf.width = parseInt(attr.textContent);
				if (attr.nodeName == "height")
					intf.height = parseInt(attr.textContent);
			});

			for (var ix=0; ix < tileDoc.childNodes.length; ++ix) {
				var node = tileDoc.childNodes[ix];
				if (node.nodeName == "layer")
					intf.layers.push(LayerData(node));
			}

			done();
		};

		xhr.send(null);
	}

	return extend(intf, {
		load: load
	});
}


// ----------------------------------------------------------------------------
//                               _             _      
//   __ _  __ _ _ __ ___   ___  | | ___   __ _(_) ___ 
//  / _` |/ _` | '_ ` _ \ / _ \ | |/ _ \ / _` | |/ __|
// | (_| | (_| | | | | | |  __/ | | (_) | (_| | | (__ 
//  \__, |\__,_|_| |_| |_|\___| |_|\___/ \__, |_|\___|
//  |___/                                |___/        
// ----------------------------------------------------------------------------
function Entity(type, state, initialVals, delegate) {
	var intf = {};

	function isOnFloor() {
		var locRow = Math.floor(intf.locY / TILE_DIM),
			locCol = Math.floor((intf.locX + 1) / TILE_DIM),
			tileVOffset = Math.round(intf.locY) & (TILE_DIM - 1),
			tileHOffset = Math.round(intf.locX) & (TILE_DIM - 1),
			onFloor = false;

		// -- rather critical test
		if((tileVOffset == TILE_DIM - 1) && intf.velY >= 0) {
			if (state.map.layers[0].tileAt(locRow + 1, locCol))
				onFloor = true;
			if ((tileHOffset > 0) && state.map.layers[0].tileAt(locRow + 1, locCol + 1))
				onFloor = true;
		}

		return onFloor;
	}

	function move(dt) {
		var backLayer = state.map.layers[0],
			locRow = Math.floor(intf.locY / TILE_DIM),
			locCol = Math.floor((intf.locX + 1) / TILE_DIM),
			tileVOffset = Math.round(intf.locY) & (TILE_DIM - 1),
			tileHOffset = Math.round(intf.locX) & (TILE_DIM - 1);

		var tryX = intf.locX + (intf.velX * dt),
			tryY = intf.locY + (intf.velY * dt),
			testX = Math.round(tryX),
			testY = Math.round(tryY),
			dirX, dirY, tileA, tileB, testCol, testRow;

		// -- these collision checks should be handled as a vector, not per component, but I can't be arsed for LD

		// -- normal movement is handled by the entity, but gravity is applied globally
		if (! isOnFloor())
			intf.velY += GRAVITY_SEC * dt;

		// -- move and collide HORIZONTAL
		if (tryX != intf.locX) {
			dirX = tryX > intf.locX ? 1 : -1;

			if (dirX < 0) {
				testCol = Math.floor((testX - 0) / TILE_DIM);
				tileA = backLayer.tileAt(locRow, testCol);
				tileB = backLayer.tileAt(locRow - 1, testCol);

				if (tileA || tileB) {
					tryX = ((testCol + 1) * TILE_DIM);
					delegate.collidedWithWall(intf);
					intf.velX = 0;
				}
			}
			else {
				testCol = Math.floor((testX + 8) / TILE_DIM);
				tileA = backLayer.tileAt(locRow, testCol);
				tileB = backLayer.tileAt(locRow - 1, testCol);

				if (tileA || tileB) {
					tryX = ((testCol - 1) * TILE_DIM);
					delegate.collidedWithWall(intf);
					intf.velX = 0;
				}
			}

			// -- update speed
			intf.locX = tryX;
			testX = Math.round(tryX);
			locCol = Math.floor((tryX + 1) / TILE_DIM);
		}

		// -- move and collide VERTICAL
		if (tryY != intf.locY) {
			dirY = tryY > intf.locY ? 1 : -1;

			if (dirY < 0) {
				testRow = Math.floor((testY - 16) / TILE_DIM);
				tileA = backLayer.tileAt(testRow, locCol);
				tileB = backLayer.tileAt(testRow, locCol + 1);

				if (tileA || ((tileHOffset > 0) && tileB)) {
					tryY = ((testRow + 3) * TILE_DIM) - 1;
					delegate.collidedWithCeiling(intf);
					intf.velY = 0;
				}
		 	}
		 	else {
				testRow = Math.floor(testY / TILE_DIM);
				tileA = backLayer.tileAt(testRow, locCol);
				tileB = backLayer.tileAt(testRow, locCol + 1);

				if (tileA || ((tileHOffset > 0) && tileB)) {
					tryY = (testRow * TILE_DIM) - 1;
					delegate.collidedWithFloor(intf);
					intf.velY = 0;
				}
			}

			// -- update state
			intf.locY = tryY;
			testY = Math.round(tryY);
			locRow = Math.floor(tryY / TILE_DIM);
		}
	}

	function act(dt) {
		delegate.act(intf);
		move(dt);
	}

	extend(extend(intf, {
		type: type,
		locX: 0, locY: 0,
		velX: 0, velY: 0,
		width: 1, height: 1,

		act: act,
		isOnFloor: isOnFloor
	}), initialVals);

	delegate.init(intf);

	return intf;
}

function PlayerEntity(state, initialVals) {
	var KEY_UP = 38, KEY_DOWN = 40, KEY_LEFT = 37, KEY_RIGHT = 39;

	var PLAYER_SPEED_SEC = 40,
		PLAYER_JUMP_SPEED_SEC = 85;

	return Entity("player", state, initialVals, {
		init: function(me) {
			me.width = 1;
			me.height = 2;
		},

		act: function(me) {
			var onFloor = me.isOnFloor();

			// -- horizontal movement, non-accelerated
			if (state.keys[KEY_LEFT])
				me.velX = -PLAYER_SPEED_SEC;
			else if (state.keys[KEY_RIGHT])
				me.velX = +PLAYER_SPEED_SEC;
			else
				me.velX = 0;

			// -- jump
			if (onFloor && state.keys[KEY_UP])
				me.velY = -PLAYER_JUMP_SPEED_SEC;
		},

		collidedWithWall: function(me) { },
		collidedWithCeiling: function(me) { },
		collidedWithFloor: function(me) { },
		collidedWithEntity: function(me, other) { }
	});
}

var Game = (function() {
	var state, player;

	function moveCamera() {
		if ((player.locX - state.cameraX) > STAGE_W / 2) {
			state.cameraX = Math.min((state.map.width * TILE_DIM) - STAGE_W, player.locX - (STAGE_W / 2));
		}
		if ((player.locX - state.cameraX) < STAGE_W / 2) {
			state.cameraX = Math.max(0, player.locX - (STAGE_W / 2));
		}
	}

	function step(dt) {
		for (var x=0; x<state.entities.length; ++x)
			state.entities[x].act(dt);
		moveCamera();
	}

	function keyChange(keyCode, pressed) {
	}

	function init(theState, done) {
		state = theState;

		state.cameraX = 0;

		state.entities = [];
		player = PlayerEntity(state, { locX: 97, locY: 135 });
		state.entities.push(player);

		state.map = MapData("level0");
		state.map.load(function() {
			// var l0 = state.map.layers[0];
			// for (var y = 0; y < l0.height; ++y) {
			// 	log(y, l0.rangeOnRow(y, 0, l0.width).join(""));
			// }

			done();
		});
	}

	return { init: init, step: step, keyChange: keyChange };
}());


// ----------------------------------------------------------------------------
//                     _           _             
//  _ __ ___ _ __   __| | ___ _ __(_)_ __   __ _ 
// | '__/ _ \ '_ \ / _` |/ _ \ '__| | '_ \ / _` |
// | | |  __/ | | | (_| |  __/ |  | | | | | (_| |
// |_|  \___|_| |_|\__,_|\___|_|  |_|_| |_|\__, |
//                                         |___/ 
// ----------------------------------------------------------------------------
var View = (function() {
	var VIEW_SCALE = 3;

	var ctx, state, tiles, off,
		tempCanvas, tempCtx;

	function drawBG() {
		ctx.fillStyle = "#439bf8";
		ctx.fillRect(0, 0, STAGE_W, STAGE_H);

		for (var y = 0; y < STAGE_H/8; ++y) {
			var tilexes = state.map.layers[0].rangeOnRow(y, Math.floor(state.cameraX / TILE_DIM), (STAGE_W/8) + 1);
			// console.log(tilexes.join(" "));

			for (var x = 0; x < tilexes.length; ++x) {
				var tilex = tilexes[x] - 1;
				if (tilex >= 0)
					ctx.drawImage(tiles, tilex * 8, 0, 8, 8,  (x * 8) - (state.cameraX & (TILE_DIM - 1)), y * 8, 8, 8);
			}
		}
	}

	function drawSprites() {
		for (var x=0; x < state.entities.length; ++x) {
			var ent = state.entities[x],
				pixWidth = ent.width = TILE_DIM,
				pixHeight = ent.height * TILE_DIM;

			ctx.drawImage(tiles, 56, 48, pixWidth, pixHeight, Math.round(ent.locX - state.cameraX), Math.round(ent.locY) - pixHeight + 1, pixWidth, pixHeight);
		}
	}

	function render() {
		drawBG();
		drawSprites();

		// ctx.fillStyle = "white";
		// ctx.font = "8px Menlo";
		// ctx.fillText("vx: " + state.playerVX, 20, 170);
		// ctx.fillText("vy: " + state.playerVY, 20, 180);
		// ctx.fillText("x: " + state.playerX, 150, 170);
		// ctx.fillText("y: " + state.playerFeetY, 150, 180);
	}

	function loadTex(done) {
		var image = new Image();
		image.onload = function() {
			// var canvas = document.createElement("canvas");
			// canvas.width = image.width;
			// canvas.height = image.height;
			// canvas.getContext("2d").drawImage(image, 0, 0);
			
			// tiles = canvas.getContext("2d"); //.getImageData(0, 0, image.width, image.height);

			tiles = image;

			done();
		};

		image.width = 64;
		image.height = 64;
		image.src = "tiles.png";
	}

	function init(theState, newCtx, done) {
		state = theState;

		ctx = newCtx;
		ctx.webkitImageSmoothingEnabled = false;
		ctx.scale(VIEW_SCALE, VIEW_SCALE);

		off = ctx.createImageData(STAGE_W, STAGE_H);
		for (var i=0; i < STAGE_W * STAGE_H; ++i)
			off.data[(i*4) + 3] = 255;

		tempCanvas = document.createElement("canvas");
		tempCanvas.width = STAGE_W; tempCanvas.height = STAGE_H;
		tempCanvas.webkitImageSmoothingEnabled = false;
		tempCtx = tempCanvas.getContext("2d");

		loadTex(done);
	}

	return { init: init, render: render };
}());


// ----------------------------------------------------------------------------
//                            _ 
//  ___  ___  _   _ _ __   __| |
// / __|/ _ \| | | | '_ \ / _` |
// \__ \ (_) | |_| | | | | (_| |
// |___/\___/ \__,_|_| |_|\__,_|
//                              
// ----------------------------------------------------------------------------
var Sound = (function() {
	var state, audio, sounds = {};

	function play(name) {
		if (!audio) return;

		var src = audio.createBufferSource();
		src.buffer = sounds[name];
		src.connect(audio.destination);
		src.noteOn(0);
	}

	function loadSounds(map, done) {
		var toLoad = 0;
		function loadOneSound(name, uri) {
			var xhr = new XMLHttpRequest();
			xhr.open("GET", uri);
			xhr.responseType = "arraybuffer";
			xhr.onload = function() {
				audio.decodeAudioData(xhr.response, function(buf) {
					sounds[name] = buf;
					if (--toLoad == 0)
						done();
				}, function() { throw new Error("Audio fail"); });
			};
			xhr.send(null);
		}

		for (var name in map) {
			++toLoad;
			loadOneSound(name, map[name]);
		}
		if (0 == toLoad)
			done();
	}

	function init(theState, done) {
		state = theState;

		try {
			audio = new clAudioContext();
			loadSounds({  }, done);
		} catch(e) {
			// document.getElementById("nosoundz").style.display = "block";
			done();
		}
	}

	return { init: init, play: play };
}());


// ----------------------------------------------------------------------------
//                  _       
//  _ __ ___   __ _(_)_ __  
// | '_ ` _ \ / _` | | '_ \ 
// | | | | | | (_| | | | | |
// |_| |_| |_|\__,_|_|_| |_|
//                          
// ----------------------------------------------------------------------------
window.MakeItBlack = (function() {
	var state = {
			t0: 0,
			keys: {}
		},
		active = true;

	function step() {
		var t = Date.now(), dt = (t - state.t0) / 1000;
		state.t0 = t; //dt = 0.002;

		// -- limit slowness to 20fps for physics reasons
		if (dt > 50)
			dt = 50;

		if (active) {
			Game.step(dt);
			View.render();
		}

		fnRequestAnimationFrame(step);
	}

	function start() {
		// document.getElementsByClassName("overlay")[0].style.display = "none";
		state.t0 = Date.now();
		step();
	}

	function init(newCtx) {
		window.onkeydown = function(e){
			var kc = e.keyCode;
			if (! state.keys[kc]) {
				state.keys[kc] = true;
				Game.keyChange(kc, true);
			}
		};
		window.onkeyup = function(e){
			var kc = e.keyCode;
			state.keys[kc] = false;
			Game.keyChange(kc, false);
		};

		window.onblur = function() { active = false };
		window.onfocus = function() { state.t0 = Date.now(); active = true; };

		// async init of components
		Game.init(state, function() {
			View.init(state, newCtx, function() {
				Sound.init(state, start);
			});
		});
	}

	return { init: init, state: state };
}());


}());