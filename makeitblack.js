(function() {
"use strict";
/* ========================================================================= *\
    Make It Black
    a.k.a. Wharrgarbl … GARBL
    (c) 2012 Arthur Langereis (@zenmumbler)
    an entry for the Ludum Dare 48 hour Compo #25 - You Are The Villain

    Feel free and look how this works and copy what you need but
    if you use any of the code or concept of this project I would
    appreciate a mention in your source code and any about boxes
    you may have.

    All code, graphics, sound and levels were created in a 48 hour window
    and as such are likely not to be considered best practice.
    Drop me a note on twitter or App.net if you like this!
\* ========================================================================= */

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
	GRAVITY_SEC = 300;



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
				return 999;
			return tileData[(row * width) + col];
		}

		function setTileAt(row, col, tile) {
			if (row < 0 || col < 0 || row >= height || col >= width)
				return;
			tileData[(row * width) + col] = tile;
		}

		function countExposedTiles() {
			// simple algo, unreachable tiles with uncovered sides are still counted
			var x = 0, y = 0, off = 0, exposed = 0;
			for (var y = 0; y < height; ++y) {
				for (var x = 0; x < width; ++x) {
					if (tileData[off] > 0) {
						if ((x > 0) && (tileData[off - 1] == 0))
							++exposed;
						else if ((x < width - 1) && (tileData[off + 1] == 0))
							++exposed;
						else if ((y > 0) && (tileData[off - width] == 0))
							++exposed;
						else if ((y < height - 1) && (tileData[off + width] == 0))
							++exposed;
					}
					++off;
				}
			}

			return exposed;
		}

		return {
			width: width, height: height,
			rangeOnRow: rangeOnRow, tileAt: tileAt,
			setTileAt: setTileAt,
			countExposedTiles: countExposedTiles
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
//             _   _ _   _           
//   ___ _ __ | |_(_) |_(_) ___  ___ 
//  / _ \ '_ \| __| | __| |/ _ \/ __|
// |  __/ | | | |_| | |_| |  __/\__ \
//  \___|_| |_|\__|_|\__|_|\___||___/
//                                   
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
			dirX, dirY, tileA, tileB, testCol, testRow, hitCoord;

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
				tileB = backLayer.tileAt(locRow - intf.height + 1, testCol);

				if (tileA || tileB) {
					if (tileA)
						hitCoord = [locRow, testCol];
					else
						hitCoord = [locRow - intf.height + 1, testCol];

					tryX = ((testCol + 1) * TILE_DIM);
					delegate.collidedWithWall(intf, hitCoord);
					intf.velX = 0;
				}
			}
			else {
				testCol = Math.floor((testX + (intf.width * TILE_DIM)) / TILE_DIM);
				tileA = backLayer.tileAt(locRow, testCol);
				tileB = backLayer.tileAt(locRow - intf.height + 1, testCol);

				if (tileA || tileB) {
					if (tileA)
						hitCoord = [locRow, testCol];
					else
						hitCoord = [locRow - intf.height + 1, testCol];

					tryX = ((testCol - intf.width) * TILE_DIM);
					delegate.collidedWithWall(intf, hitCoord);
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
				testRow = Math.floor((testY - (intf.height * TILE_DIM)) / TILE_DIM);
				tileA = backLayer.tileAt(testRow, locCol);
				tileB = backLayer.tileAt(testRow, locCol + 1); // + intf.width

				if (tileA || (((tileHOffset > 0) || (intf.width > 1)) && tileB)) {
					if (tileA)
						hitCoord = [testRow, locCol];
					else
						hitCoord = [testRow, locCol + 1];

					tryY = ((testRow + intf.height + 1) * TILE_DIM) - 1;
					delegate.collidedWithCeiling(intf, hitCoord);
					intf.velY = 0;
				}
		 	}
		 	else {
				testRow = Math.floor(testY / TILE_DIM);
				tileA = backLayer.tileAt(testRow, locCol);
				tileB = backLayer.tileAt(testRow, locCol + 1); // + intf.width

				if (tileA || (((tileHOffset > 0) || (intf.width > 1)) && tileB)) {
					if (tileA)
						hitCoord = [testRow, locCol];
					else
						hitCoord = [testRow, locCol + 1];

					tryY = (testRow * TILE_DIM) - 1;
					delegate.collidedWithFloor(intf, hitCoord);
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

	function tileIndex() {
		return delegate.tileIndex(intf);
	}

	extend(extend(intf, {
		type: type,
		locX: 0, locY: 0,
		velX: 0, velY: 0,
		width: 1, height: 1,
		lookLeft: false,
		removeMe: false,

		act: act,
		tileIndex: tileIndex,
		isOnFloor: isOnFloor,
	}), initialVals);

	delegate.init(intf);

	return intf;
}


function FuzzleEntity(state, initialVals) {
	var FUZZLE_SPEED_SEC = 15,
		FUZZLE_JUMP_SPEED_SEC = 85,
		FUZZLE_WANDER = 1,
		FUZZLE_IDLE = 2;

	return Entity("fuzzle", state, initialVals, {
		init: function(me) {
			me.width = 2;
			me.height = 2;
			me.action = FUZZLE_IDLE;
			me.nextAction = 0;
			me.movementBlocked = false;
		},

		tileIndex: function(me) {
			return [38, 36];
		},

		act: function(me) {
			var onFloor = me.isOnFloor(),
				blocked = false;

			if (me.nextAction <= Date.now()) {
				if (Math.random() > 0.6) {
					me.action = FUZZLE_WANDER;

					if (Math.random() > 0.5) {
						me.velX = -FUZZLE_SPEED_SEC;
						me.lookLeft = true;
					}
					else {
						me.velX = FUZZLE_SPEED_SEC;
						me.lookLeft = false;
					}
				}
				else
					me.action = FUZZLE_IDLE;
				me.nextAction = Date.now() + 2000 + (Math.random() * 3000);
			}

			if (me.action == FUZZLE_WANDER) {
				if (onFloor && me.movementBlocked) {
					me.movementBlocked = false;
					me.velY = -FUZZLE_JUMP_SPEED_SEC;
				}
			}
		},

		collidedWithWall: function(me) { me.movementBlocked = true; },
		collidedWithCeiling: function(me) { },
		collidedWithFloor: function(me) { },
		collidedWithEntity: function(me, other) { }
	});
}


function DarknessBlob(state, initialVals) {
	var BLOB_HORIZ_SPEED = 90,
		BLOB_VERT_SPEED = 60,
		BLOB_VERT_SPEED_LOW = 0;

	function tarnish(hitCoord) {
		var row = hitCoord[0], col = hitCoord[1],
			layer = state.map.layers[0],
			tile = layer.tileAt(row, col);

		if (tile < 16) {
			layer.setTileAt(row, col, tile + 16);
			++state.tarnishedTiles;
		}
	}

	return Entity("blob", state, initialVals, {
		init: function(me) {
			me.width = 1;
			me.height = 1;

			if (me.lookLeft)
				me.velX = (0.90 * -BLOB_HORIZ_SPEED) + (Math.random() * 0.2 * BLOB_HORIZ_SPEED);
			else
				me.velX = (0.90 *  BLOB_HORIZ_SPEED) + (Math.random() * 0.2 * BLOB_HORIZ_SPEED);

			me.velY = me.lowBeam ? -BLOB_VERT_SPEED_LOW : -BLOB_VERT_SPEED;
		},

		tileIndex: function(me) {
			return 24;
		},

		act: function(me) {
		},

		collidedWithWall: function(me, hitCoord) { me.removeMe = true; tarnish(hitCoord); },
		collidedWithCeiling: function(me, hitCoord) { me.removeMe = true; tarnish(hitCoord); },
		collidedWithFloor: function(me, hitCoord) { me.removeMe = true; tarnish(hitCoord); },
		collidedWithEntity: function(me, other) { me.removeMe = true; tarnish(hitCoord); }
	});
}


function PlayerEntity(state, initialVals) {
	var KEY_UP = 38, KEY_DOWN = 40, KEY_LEFT = 37, KEY_RIGHT = 39, KEY_SPACE = 32;

	var PLAYER_SPEED_SEC = 60,
		PLAYER_JUMP_SPEED_SEC = 100;

	return Entity("player", state, initialVals, {
		init: function(me) {
			me.width = 1;
			me.height = 2;
		},

		tileIndex: function(me) {
			if (me.lookLeft) {
				if (me.velY < 0)
					return 50;
				if (me.velX)
					return [54, 52];
				if (me.glarbl)
					return 48;
				return 54;
			}
			else {
				if (me.velY < 0)
					return 51;
				if (me.velX)
					return [55, 53];
				if (me.glarbl)
					return 49;
				return 55;
			}
		},

		act: function(me) {
			var onFloor = me.isOnFloor();

			// -- horizontal movement, non-accelerated
			if (state.keys[KEY_LEFT]) {
				me.velX = -PLAYER_SPEED_SEC;
				me.lookLeft = true;
			}
			else if (state.keys[KEY_RIGHT]) {
				me.velX = +PLAYER_SPEED_SEC;
				me.lookLeft = false;
			}
			else
				me.velX = 0;

			// -- jump
			if (onFloor && state.keys[KEY_UP])
				me.velY = -PLAYER_JUMP_SPEED_SEC;

			// -- spew bile
			if (state.keys[KEY_SPACE]) {
				if (state.bile <= 0)
					return; // play some sad gargling sound

				state.bile = Math.max(0, state.bile - 1.5);

				var off = me.lookLeft ? -2 : 1,
					low = !!state.keys[KEY_DOWN];
				state.entities.push(DarknessBlob(state, {
					locX: me.locX + off,
					locY: me.locY - 7,
					lookLeft: me.lookLeft,
					lowBeam: low
				}));
				me.glarbl = true;
			}
			else {
				me.glarbl = false;
				if ((state.frameCtr & 1) == 0)
					state.bile = Math.min(100, state.bile + 1);
			}
		},

		collidedWithWall: function(me) { },
		collidedWithCeiling: function(me) { },
		collidedWithFloor: function(me) { },
		collidedWithEntity: function(me, other) {
			if (other.type == "player")
				return false;
		}
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
		// -- filter out entities that want to be removed
		state.entities = state.entities.filter(function(ent) {
			return !ent.removeMe;
		});

		for (var x=0; x<state.entities.length; ++x)
			state.entities[x].act(dt);

		moveCamera();
	}

	function keyChange(keyCode, pressed) {
	}

	function init(theState, done) {
		state = theState;

		state.entities = [];
		player = PlayerEntity(state, { locX: 97, locY: 135 });
		state.entities.push(player);
		state.player = player;

		state.bile = 100;
		state.disgust = 0;

		state.map = MapData("level0");
		state.map.load(function() {
			state.exposedTiles = state.map.layers[0].countExposedTiles();
			log("exposed: ", state.exposedTiles);
			state.tarnishedTiles = 0;

			state.entities.push(FuzzleEntity(state, { locX: 20, locY: 100 }));
			state.entities.push(FuzzleEntity(state, { locX: 220, locY: 80 }));

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

	var ctx, state, tiles;

	function colerp(from, to, ratio) {
		var r = from[0], g = from[1], b = from[2],
			R = to[0], G = to[1], B = to[2],
			dr = R - r, dg = G - g, db = B - b;
		return [r + (ratio * dr), g + (ratio * dg), b + (ratio * db)].map(function(v) { return Math.round(v); }).join(",");
	}

	function drawBG() {
		// BG gets darker as world gets corrupted
		var skyColorBad    = [ 67,155,248],
			skyColorGood   = [  0, 14, 48],
			lightColorBad  = [255,246,144],
			lightColorGood = [  0, 8, 16],
			sky, light,
			completion = Math.min(1.0, (state.tarnishedTiles / state.exposedTiles) / 0.85); // need to cover 85% of exposed tiles to complete level

		sky = "rgb(" + colerp(skyColorBad, skyColorGood, completion) + ")";
		light = "rgb(" + colerp(lightColorBad, lightColorGood, completion) + ")";

		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, STAGE_W, STAGE_H);

		var sunGradient = ctx.createLinearGradient(STAGE_W, 0, STAGE_W * .75, 0);
		sunGradient.addColorStop(0.0, light);
		sunGradient.addColorStop(1.0, sky);

		ctx.fillStyle = sunGradient;
		ctx.fillRect(0, 0, STAGE_W, STAGE_H);

		for (var y = 0; y < STAGE_H/8; ++y) {
			var tilexes = state.map.layers[0].rangeOnRow(y, Math.floor(state.cameraX / TILE_DIM), (STAGE_W/8) + 1);

			for (var x = 0; x < tilexes.length; ++x) {
				var tilex = tilexes[x] - 1;
				if (tilex >= 0)
					ctx.drawImage(tiles, (tilex & 7) * 8, tilex & 0xf8, 8, 8,  (x * 8) - (state.cameraX & (TILE_DIM - 1)), y * 8, 8, 8);
			}
		}
	}

	function drawSprites() {
		for (var x=0; x < state.entities.length; ++x) {
			var ent = state.entities[x],
				pixWidth = ent.width * TILE_DIM,
				pixHeight = ent.height * TILE_DIM,
				tilex = ent.tileIndex();

			if (tilex.length) {
				tilex = tilex[Math.floor(state.frameCtr / (60 / tilex.length)) % tilex.length];
			}

			ctx.drawImage(tiles, (tilex & 7) * 8, tilex & 0xf8, pixWidth, pixHeight, Math.round(ent.locX - state.cameraX), Math.round(ent.locY) - pixHeight + 1, pixWidth, pixHeight);
		}
	}

	function drawMeters() {
		ctx.strokeStyle = "white";
		ctx.strokeRect(8, 8, 103, 6);
		ctx.strokeRect(STAGE_W - 103 - 8, 8, 103, 6);

		ctx.fillStyle = "#444";
		ctx.fillRect(9.5, 9.5, state.bile, 3);

		ctx.fillStyle = "#49a255";
		ctx.fillRect(STAGE_W - 100 - 9.5, 9.5, state.disgust, 3);

		ctx.font = "6px Helvetica";
		ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 1;
		ctx.shadowColor = "rgba(0,0,0, 0.5)";

		ctx.textAlign = "start";
		ctx.fillStyle = "#444";
		ctx.fillText("Bile", 9, 8);

		ctx.textAlign = "end";
		ctx.fillStyle = "#49a255";
		ctx.fillText("Disgust", STAGE_W - 9, 8);
		ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
	}

	function render() {
		++state.frameCtr;
		drawBG();
		drawSprites();
		drawMeters();

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
		image.src = "tiles.png?x=" + Date.now();
	}

	function init(theState, newCtx, done) {
		state = theState;

		ctx = newCtx;
		ctx.webkitImageSmoothingEnabled = false;
		ctx.scale(VIEW_SCALE, VIEW_SCALE);

		state.frameCtr = 0;
		state.cameraX = 0;

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