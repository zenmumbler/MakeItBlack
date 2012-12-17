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

// state actions
var LEVEL_LOADNEXT = "loadnext",
	LEVEL_LOADING = "loading",
	LEVEL_START = "start",
	LEVEL_FADEIN = "fadein",
	LEVEL_PLAY = "play",
	LEVEL_MESSAGE = "modalmessage",
	LEVEL_END = "end",
	LEVEL_FADEOUT = "fadeout";

var FINAL_LEVEL = 3;

var KEY_UP = 38, KEY_DOWN = 40, KEY_LEFT = 37, KEY_RIGHT = 39,
	KEY_SPACE = 32, KEY_RETURN = 13;



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

		function eachTile(callback) {
			var off = 0;
			for (var row = 0; row < height; ++row) {
				for (var col = 0; col < width; ++col) {
					if (tileData[off])
						callback(row, col, tileData[off]);
					++off;
				}
			}
		}

		function countExposedTiles() {
			// simple algo, unreachable tiles with uncovered sides are still counted
			var off = 0, exposed = 0;
			for (var y = 0; y < height; ++y) {
				for (var x = 0; x < width; ++x) {
					if (tileData[off] > 0) {
						if ((x > 0) && (tileData[off - 1] == 0))
							++exposed;
						else if ((x < width - 1) && (tileData[off + 1] == 0))
							++exposed;
						else if ((y > 0) && (tileData[off - width] == 0))
							++exposed;
						// else if ((y < height - 1) && (tileData[off + width] == 0))  // don't count tiles with only bottoms free
						// 	++exposed;
					}
					++off;
				}
			}

			return exposed;
		}

		return {
			width: width, height: height,
			rangeOnRow: rangeOnRow,
			tileAt: tileAt,
			setTileAt: setTileAt,
			eachTile: eachTile,
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

	function collidedWithEntity(other) {
		return delegate.collidedWithEntity(intf, other);
	}

	function checkEntityCollisions() {
		var axl = intf.locX,
			axr = intf.locX + (intf.width * TILE_DIM),
			ayt = intf.locY - (intf.height * TILE_DIM),
			ayb = intf.locY;

		each(state.entities, function(other) {
			if (other.id == intf.id) return;

			var bxl = other.locX,
				bxr = other.locX + (other.width * TILE_DIM),
				byt = other.locY - (other.height * TILE_DIM),
				byb = other.locY;

			if (axl < bxr && axr > bxl && ayt < byb && ayb > byt) {
				delegate.collidedWithEntity(intf, other);
				other.collidedWithEntity(intf);
			}
		});
	}

	function act(dt) {
		delegate.act(intf);
		move(dt);
		checkEntityCollisions();
	}

	function tileIndex() {
		return delegate.tileIndex(intf);
	}

	extend(extend(intf, {
		id: ++Entity.GlobalID,
		type: type,
		locX: 0, locY: 0,
		velX: 0, velY: 0,
		width: 1, height: 1,
		lookLeft: false,
		removeMe: false,

		act: act,
		tileIndex: tileIndex,
		isOnFloor: isOnFloor,
		collidedWithEntity: collidedWithEntity
	}), initialVals);

	delegate.init(intf);

	return intf;
}
Entity.GlobalID = 0;


function PetEntity(state, initialVals) {
	var PET_SPEED_SEC = 15,
		PET_JUMP_SPEED_SEC = 85,
		PET_WANDER = 1,
		PET_IDLE = 2;

	return Entity("pet", state, initialVals, {
		init: function(me) {
			me.width = 2;
			me.height = 1;
			me.action = PET_IDLE;
			me.nextAction = 0;
			me.HP = 100;
		},

		tileIndex: function(me) {
			if (me.lookLeft)
				return [72, 74];
			else
				return [80, 82];
		},

		act: function(me) {
			if (me.nextAction <= state.t0) {
				if (Math.random() > 0.6) {
					me.action = PET_WANDER;

					if (Math.random() > 0.5) {
						me.velX = -PET_SPEED_SEC;
						me.lookLeft = true;
					}
					else {
						me.velX = PET_SPEED_SEC;
						me.lookLeft = false;
					}
				}
				else {
					me.action = PET_IDLE;
					me.velX = 0;
				}

				var delay = me.action == PET_IDLE ? 500 : 1000 + (Math.random() * 2000);
				me.nextAction = state.t0 + delay;
			}

			if (me.isOnFloor() && (Math.random() > 0.98)) {
				me.velY = -PET_JUMP_SPEED_SEC;
			}

			if (Math.random() > 0.99)
				; // play sound
		},

		collidedWithWall: function(me) { },
		collidedWithCeiling: function(me) { },
		collidedWithFloor: function(me) { },
		collidedWithEntity: function(me, other) { }
	});
}


function FuzzleEntity(state, initialVals) {
	var FUZZLE_SPEED_SEC = 20,
		FUZZLE_ENGAGE_SPEED_SEC = 30,
		FUZZLE_JUMP_SPEED_SEC = 85,
		FUZZLE_ENGAGE_JUMP_SPEED_SEC = 105,
		FUZZLE_WANDER = 1,
		FUZZLE_ENGAGE = 2,
		FUZZLE_IDLE = 3;

	return Entity("fuzzle", state, initialVals, {
		init: function(me) {
			me.width = 2;
			me.height = 2;
			me.action = FUZZLE_IDLE;
			me.nextAction = 0;
			me.movementBlocked = false;
			me.HP = 100;
			me.enemy = true;
		},

		tileIndex: function(me) {
			return [38, 36];
		},

		act: function(me) {
			var onFloor = me.isOnFloor(),
				pdx = Math.abs(me.locX - state.player.locX),
				pdy = Math.abs(me.locY - state.player.locY),
				nearPlayer = Math.sqrt((pdx * pdx) + (pdy * pdy)) < 40;

			if (nearPlayer) {
				me.action = FUZZLE_ENGAGE;
				me.lookLeft = (state.player.locX < me.locX);
			}
			else {
				if (me.nextAction <= state.t0) {
					if (Math.random() > 0.6) {
						me.action = FUZZLE_WANDER;

						if (Math.random() > 0.5)
							me.lookLeft = true;
						else
							me.lookLeft = false;
					}
					else
						me.action = FUZZLE_IDLE;

					var delay = me.action == FUZZLE_IDLE ? 500 : 1000 + (Math.random() * 2000);
					me.nextAction = state.t0 + delay;
				}
			}

			if (me.action != FUZZLE_IDLE) {
				if (me.action == FUZZLE_ENGAGE)
					me.velX = me.lookLeft ? -FUZZLE_ENGAGE_SPEED_SEC : FUZZLE_ENGAGE_SPEED_SEC;
				else
					me.velX = me.lookLeft ? -FUZZLE_SPEED_SEC : FUZZLE_SPEED_SEC;

				if (onFloor && me.movementBlocked) {
					me.movementBlocked = false;
					me.velY = me.action ? -FUZZLE_ENGAGE_JUMP_SPEED_SEC : -FUZZLE_JUMP_SPEED_SEC;
				}
			}
			else
				me.velX = 0;
		},

		collidedWithWall: function(me) { me.movementBlocked = true; },
		collidedWithCeiling: function(me) { },
		collidedWithFloor: function(me) { },
		collidedWithEntity: function(me, other) {
			if (other.type == "blob") {
				me.HP = Math.max(0, me.HP - 4);
				if (me.HP == 0) {
					me.removeMe = true;
					Sound.play("fuzzledie");
				}
			}
		}
	});
}


function HeartEntity(state, initialVals) {
	return Entity("heart", state, initialVals, {
		init: function(me) {
			me.velX = me.velY = 0;
			me.dead = false;
			me.enemy = true;
			me.HP = 100;
		},

		tileIndex: function(me) {
			return me.dead ? 24 : [8, 15];
		},

		act: function(me) {
			if (me.dead) return;

			if (state.completion == 1) {
				if (me.floorCol == undefined) {
					me.floorRow = Math.floor((me.locY + 2) / TILE_DIM),
					me.floorCol = Math.floor((me.locX + 2) / TILE_DIM);
				}

				var floorTilex = state.map.layers[0].tileAt(me.floorRow, me.floorCol);
				if (floorTilex < 16) { // normal
					if (Math.random() > 0.98)
						state.map.layers[0].setTileAt(me.floorRow, me.floorCol, floorTilex + 16);
				}
				else { // corrupted
					if (Math.random() > 0.98)
						me.dead = true;
				}
			}
		},

		collidedWithWall: function(me, hitCoord) { },
		collidedWithCeiling: function(me, hitCoord) { },
		collidedWithFloor: function(me, hitCoord) { },
		collidedWithEntity: function(me, other) {
			if (other.type == "blob") {
				// play some sound
			}
		}
	});
}


function BackgroundEntity(state, initialVals) {
	return Entity("perishable", state, initialVals, {
		init: function(me) {
			me.velX = me.velY = 0;
			me.pure = me.tilex < 16;
		},

		tileIndex: function(me) {
			return me.tilex;
		},

		act: function(me) {
			if (me.pure) {
				if (undefined == me.floorCol) {
					me.floorRow = Math.floor((me.locY + 2) / TILE_DIM),
					me.floorCol = Math.floor((me.locX + 2) / TILE_DIM);
				}

				var floorTilex = state.map.layers[0].tileAt(me.floorRow, me.floorCol);
				if (floorTilex >= 16) // corrupted
					if (Math.random() > 0.99) {
						me.tilex += 16;
						me.pure = false; // wither
					}
			}
		},

		collidedWithWall: function(me, hitCoord) { },
		collidedWithCeiling: function(me, hitCoord) { },
		collidedWithFloor: function(me, hitCoord) { },
		collidedWithEntity: function(me, other) {
			if (me.pure && other.type == "blob") {
				me.tilex += 16;
				me.pure = false;
			}
		}
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

		if (state.t0 - (state.lastSplatSound || 0) > 50) {
			state.lastSplatSound = state.t0;
			Sound.play("splat");
		}
	}

	return Entity("blob", state, initialVals, {
		init: function(me) {
			me.width = 1;
			me.height = 1;

			if (me.lookLeft)
				me.velX = (0.75 * -BLOB_HORIZ_SPEED) + (Math.random() * 0.5 * BLOB_HORIZ_SPEED);
			else
				me.velX = (0.75 *  BLOB_HORIZ_SPEED) + (Math.random() * 0.5 * BLOB_HORIZ_SPEED);

			var baseY = me.lowBeam ? -BLOB_VERT_SPEED_LOW : -BLOB_VERT_SPEED
			me.velY = (0.85 * baseY) + (Math.random() * 0.3 * baseY);
		},

		tileIndex: function(me) {
			return 32;
		},

		act: function(me) {
		},

		collidedWithWall: function(me, hitCoord) { me.removeMe = true; tarnish(hitCoord); },
		collidedWithCeiling: function(me, hitCoord) { me.removeMe = true; tarnish(hitCoord); },
		collidedWithFloor: function(me, hitCoord) { me.removeMe = true; tarnish(hitCoord); },
		collidedWithEntity: function(me, other) {
			if (other.type != "player" && other.type != "blob") {
				if (other.type != "perishable" || other.pure) {
					me.removeMe = true;

					if (state.t0 - (state.lastSplatSound || 0) > 50) {
						state.lastSplatSound = state.t0;
						Sound.play("splat");
					}
				}
			}
		}
	});
}


function PlayerEntity(state, initialVals) {
	var PLAYER_SPEED_SEC = 60,
		PLAYER_JUMP_SPEED_SEC = 100,
		PLAYER_HIT_SPEED_BOOST = 1000;

	return Entity("player", state, initialVals, {
		init: function(me) {
			me.width = 1;
			me.height = 2;
			me.invulnerableUntil = 0;
			me.walkSpeed = 0;
			me.hitSpeed = 0;
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

			if (state.timeOfDeath) {
				// I R DED
				me.velX = me.velY = 0;
				return;
			}

			// -- horizontal movement, non-accelerated
			if (state.keys[KEY_LEFT]) {
				me.walkSpeed = -PLAYER_SPEED_SEC;
				me.lookLeft = true;
			}
			else if (state.keys[KEY_RIGHT]) {
				me.walkSpeed = +PLAYER_SPEED_SEC;
				me.lookLeft = false;
			}
			else
				me.walkSpeed = 0;

			// -- combined
			me.hitSpeed *= 0.6;
			if (Math.abs(me.hitSpeed) < 10)
					me.hitSpeed = 0;
			me.velX = me.walkSpeed + me.hitSpeed;

			// -- jump
			if (onFloor && state.keys[KEY_UP]) {
				me.velY = -PLAYER_JUMP_SPEED_SEC;
				Sound.play("jump");
			}

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

				// Sound.play(["spew1", "spew2"][Math.random() > 0.5 ? 1 : 0]);
			}
			else {
				me.glarbl = false;
				if ((state.frameCtr & 1) == 0)
					state.bile = Math.min(100, state.bile + 1.5);
			}
		},

		collidedWithWall: function(me) { },
		collidedWithCeiling: function(me) { },
		collidedWithFloor: function(me) {
			Sound.play("land");
		},
		collidedWithEntity: function(me, other) {
			if (state.timeOfDeath || (me.invulnerableUntil > state.t0))
				return;

			if (other.enemy && !other.dead) {
				var damage = { heart: 24, fuzzle: 12 }[other.type] || 12;

				state.disgust = Math.min(100, state.disgust + damage); // <-- put in state / Game
				if ((state.disgust == 100) && !state.timeOfDeath) {
					state.timeOfDeath = state.t0;
					state.deathRatio = 0;

					Sound.play("die");
					return;
				}

				var sgn = (other.locX > me.locX) ? -1 : 1;
				me.hitSpeed = sgn * PLAYER_HIT_SPEED_BOOST;

				Sound.play("hit");

				me.invulnerableUntil = state.t0 + 2000;
			}
		}
	});
}


// ----------------------------------------------------------------------------
//                     _           _             
//  _ __ ___ _ __   __| | ___ _ __(_)_ __   __ _ 
// | '__/ _ \ '_ \ / _` |/ _ \ '__| | '_ \ / _` |
// | | |  __/ | | | (_| |  __/ |  | | | | | (_| |
// |_|  \___|_| |_|\__,_|\___|_|  |_|_| |_|\__, |
//                                         |___/ 
// ----------------------------------------------------------------------------
function Cloud(state, ctx, locX) {
	var segCount = 9 + Math.round(Math.random() * 7),
		segs = [],
		locY = 16 + (Math.random() * 24),
		period = 3000 + Math.round(Math.random() * 4000),
		rScaleMax = 0.1;

	for (var k=0; k<segCount; ++k) {
		segs.push({
			cx: locX - 15 + (Math.random() * 30),
			cy: locY -  6 + (Math.random() * 12),
			r: 5 + (Math.random() * 5),
			alpha: 0.15 + (Math.random() * 0.08)
		});
	}

	function draw(alphaScale) {
		var tau = 2 * Math.PI,  // happy now, @notch?
			cycle = tau * ((state.t0 % period) / period),
			rScale = 1 + (rScaleMax * Math.sin(cycle)),
			seg;

		ctx.fillStyle = "white";
		for (var k=0; k<segCount; ++k) {
			seg = segs[k];
			ctx.globalAlpha = seg.alpha * alphaScale;
			ctx.beginPath();
			ctx.arc(seg.cx - state.cameraX, seg.cy, seg.r * rScale, 0, tau, false);
			ctx.closePath();
			ctx.fill();
		}
	}

	return { draw: draw };
}


var View = (function() {
	var VIEW_SCALE = 3;

	var ctx, state, tiles, clouds, stars;

	function colerp(from, to, ratio) {
		var r = from[0], g = from[1], b = from[2],
			R = to[0], G = to[1], B = to[2],
			dr = R - r, dg = G - g, db = B - b;
		return [r + (ratio * dr), g + (ratio * dg), b + (ratio * db)].map(function(v) { return Math.round(v); }).join(",");
	}

	function buildClouds() {
		var x = -10;

		clouds = [];
		while(x < (state.map.width * TILE_DIM) + 10) {
			clouds.push(Cloud(state, ctx, x));
			x += 15 + (Math.random() * 40);
		}
	}

	function drawClouds() {
		each(clouds, function(cloud) { cloud.draw(1.0); });
		ctx.globalAlpha = 1.0;
	}

	function drawTextBox(title, message) {
		var gradient = ctx.createLinearGradient(0, 0, 0, 100);
		gradient.addColorStop(0.0, "black");
		gradient.addColorStop(1.0, "#333");

		ctx.fillStyle = gradient;
		ctx.fillRect(50, 40, 220, 100);
		ctx.strokeStyle = "#ccc";
		ctx.strokeRect(52, 42, 216, 96);

		ctx.fillStyle = "#ac1602";
		ctx.textAlign = "center";
		ctx.font = "10px Arial";
		ctx.fillText(title, 160, 55);

		ctx.fillStyle = "white";
		ctx.font = "8px Arial";
		var lines = message.split("\n");
		each(lines, function(line, ix) {
			ctx.fillText(line, 160, 70 + (ix * 10));
		});

		ctx.fillStyle = "#aaa";
		ctx.font = "5px Arial";
		ctx.fillText("-- press return to continue --", 160, 135);
	}

	function drawBG() {
		// BG gets darker as world gets corrupted
		var skyColorBad    = [ 67,155,248],
			skyColorGood   = [  0, 14, 48],
			lightColorBad  = [255,246,144],
			lightColorGood = [  0,  8, 16],
			sky, light;

		// -- sky
		sky = "rgb(" + colerp(skyColorBad, skyColorGood, state.completion) + ")";
		light = "rgb(" + colerp(lightColorBad, lightColorGood, state.completion) + ")";

		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, STAGE_W, STAGE_H);

		// -- COME TO THE LIGHT
		var sunGradient = ctx.createLinearGradient(STAGE_W, 0, STAGE_W * .75, 0);
		sunGradient.addColorStop(0.0, light);
		sunGradient.addColorStop(1.0, sky);

		ctx.fillStyle = sunGradient;
		ctx.fillRect(0, 0, STAGE_W, STAGE_H);


		// -- BG tiles
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
				tilex = ent.tileIndex(),
				scale = 1.0;

			if (ent.type == "player") {
				if (ent.invulnerableUntil > state.t0 && state.frameCtr & 1)
					continue;

				ctx.save();

				// perform hack death animation
				if (state.deathRatio) {
					ctx.translate(Math.round(ent.locX - state.cameraX + 4), Math.round(ent.locY) - pixHeight + 1);
					ctx.rotate(-0.25 + (Math.random() * 0.5));
					ctx.translate(-Math.round(ent.locX - state.cameraX + 4), -(Math.round(ent.locY) - pixHeight + 1));
					ctx.globalAlpha = 0.2 + (Math.random() * 0.7);
					scale = 1 + (state.deathRatio * 4);
					tilex = 51;
				}
			}

			// -- animation sequences are spread out over a second
			if (tilex.length)
				tilex = tilex[Math.floor(state.frameCtr / (60 / tilex.length)) % tilex.length];

			if (ent.enemy)
				ctx.globalAlpha = 0.2 + (0.8 * (ent.HP / 100));

			ctx.drawImage(tiles, (tilex & 7) * 8, tilex & 0xf8, pixWidth, pixHeight, Math.round(ent.locX - state.cameraX), Math.round(ent.locY) - pixHeight + 1, pixWidth * scale, pixHeight * scale);
			ctx.globalAlpha = 1.0;

			if (ent.type == "player")
				ctx.restore();
		}
	}

	function drawMeters() {
		var showDisgust = state.levelIndex > 0 && state.levelIndex < FINAL_LEVEL;

		ctx.strokeStyle = "white";
		ctx.strokeRect(8, 8, 103, 6);
		if (showDisgust)
			ctx.strokeRect(STAGE_W - 103 - 8, 8, 103, 6);

		ctx.fillStyle = "#000";
		ctx.fillRect(9.5, 9.5, state.bile, 3);

		if (showDisgust) {
			ctx.fillStyle = "#49a255";
			ctx.fillRect(STAGE_W - 100 - 9.5, 9.5, state.disgust, 3);
		}

		ctx.font = "6px Arial";
		ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 1;
		ctx.shadowColor = "rgba(0,0,0, 0.5)";

		ctx.textAlign = "start";
		ctx.fillStyle = "#000";
		ctx.shadowColor = "rgba(255,255,255, 0.5)";
		ctx.fillText("Bile", 9, 8);

		if (showDisgust) {
			ctx.shadowColor = "rgba(0,0,0, 0.5)";
			ctx.textAlign = "end";
			ctx.fillStyle = "#49a255";
			ctx.fillText("Disgust", STAGE_W - 9, 8);
		}

		ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
	}

	function drawLevelComplete() {
		var SLIDE_EM = 1500;
		var title, subtitle,
			dtc = state.t0 - state.completionTime,
			slideRatio = Math.min(1.0, dtc / SLIDE_EM);
		slideRatio *= slideRatio;

		if (state.levelIndex == FINAL_LEVEL) {
			title = "All Clear";
			subtitle = "Here's your damn goat."
		}
		else {
			title = "Level Clear";
			subtitle = ["Didn't that feel good?", "Mick Jagger is proud of you.", "Your salivary glands must be HUGE."][state.levelIndex];
		}

		ctx.shadowColor = "rgba(0,0,0, 0.5)";

		ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 2;
		ctx.font = "30px Arial";
		ctx.textAlign = "center";
		ctx.fillStyle = "white";
		ctx.fillText(title, 160, -20 + (100 * slideRatio));

		if (slideRatio == 1.0) {
			ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 1;
			ctx.font = "10px Arial";
			ctx.fillStyle = "#49a255";
			ctx.fillText(subtitle, 160, 100);
		}

		if ((state.levelIndex < FINAL_LEVEL) && (state.frameCtr & 32) && (slideRatio == 1.0)) {
			ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 1;
			ctx.font = "6px Arial";
			ctx.fillStyle = "white";
			ctx.fillText("-- press return to proceed --", 160, 180);
		}

		ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
	}

	function render() {
		++state.frameCtr;
		drawBG();
		drawSprites();
		drawClouds();
		drawMeters();

		if (state.completion == 1.0)
			drawLevelComplete();
	}

	function drawDimmer(alpha) {
		ctx.globalAlpha = alpha;
		ctx.fillStyle = "black";
		ctx.fillRect(0, 0, STAGE_W, STAGE_H);
		ctx.globalAlpha = 1.0;
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
		image.height = 96;
		image.src = "tiles.png?x=" + Date.now();
	}

	function levelChanged() {
		state.frameCtr = 0;
		state.cameraX = 0;

		buildClouds();
	}

	function init(theState, newCtx, done) {
		state = theState;

		ctx = newCtx;
		ctx.webkitImageSmoothingEnabled = false;
		ctx.mozImageSmoothingEnabled = false;
		ctx.scale(VIEW_SCALE, VIEW_SCALE);

		loadTex(done);
	}

	return { init: init, levelChanged: levelChanged, render: render, drawDimmer: drawDimmer, drawTextBox: drawTextBox };
}());



// ----------------------------------------------------------------------------
//                               _             _      
//   __ _  __ _ _ __ ___   ___  | | ___   __ _(_) ___ 
//  / _` |/ _` | '_ ` _ \ / _ \ | |/ _ \ / _` | |/ __|
// | (_| | (_| | | | | | |  __/ | | (_) | (_| | | (__ 
//  \__, |\__,_|_| |_| |_|\___| |_|\___/ \__, |_|\___|
//  |___/                                |___/        
// ----------------------------------------------------------------------------
var Game = (function() {
	var state;

	function moveCamera() {
		if ((state.player.locX - state.cameraX) > STAGE_W / 2) {
			state.cameraX = Math.min((state.map.width * TILE_DIM) - STAGE_W, state.player.locX - (STAGE_W / 2));
		}
		if ((state.player.locX - state.cameraX) < STAGE_W / 2) {
			state.cameraX = Math.max(0, state.player.locX - (STAGE_W / 2));
		}
	}

	function checkMessages() {
		// HERE COMES THE HARDCODE WAGON!
		if (state.action != LEVEL_PLAY)
			return;

		if (state.levelIndex == 0) {
			if (! state.messageA && state.player.locX > 50) {
				state.messageA = true;
				state.action = LEVEL_MESSAGE;
				state.msgTitle = "Oh bollocks";
				state.msgText  = "So, on the way back to your dark dimension\nyou wound up on some lovey-dovey world!\n\nTo proceed you must darken things up.\nWalk and jump with ARROWS and spew with SPACE,\ncover the place in darkness!";
			}

			if (! state.messageB && state.player.locX > 250) {
				state.messageB = true;
				state.action = LEVEL_MESSAGE;
				state.msgTitle = "By the way...";
				state.msgText  = "\nYou can SPEW at a LOWER ANGLE by\nholding the DOWN arrow while holding SPACE.\n\nTarnish away!";
			}
		}

		if (state.levelIndex == 1) {
			if (! state.messageC && state.player.locX > 25) {
				state.messageC = true;
				state.action = LEVEL_MESSAGE;
				state.msgTitle = "Ewwww";
				state.msgText  = "Just being here makes you sick\nso DON'T TOUCH the fuzzies or the HEARTS!\nKeep an eye on your DISGUST METER.\n\nYou can eliminate the fuzzies but not the hearts.\nPower of love 'n all that.";
			}
		}
	}

	function step(dt) {
		// -- completion
		if (state.levelIndex < FINAL_LEVEL)
			state.completion = Math.min(1.0, (state.tarnishedTiles / state.exposedTiles) / 0.82); // need to cover 82% of exposed tiles to complete level
		else {
			var c = Math.min(1.0, state.player.locX / 420);
			if (c > state.completion)
				state.completion = c;
		}

		// -- filter out entities that want to be removed
		state.entities = state.entities.filter(function(ent) {
			return !ent.removeMe;
		});

		for (var x=0; x<state.entities.length; ++x)
			state.entities[x].act(dt);

		moveCamera();

		if (state.action == LEVEL_PLAY && state.completion == 1.0 && state.levelIndex < FINAL_LEVEL && state.keys[KEY_RETURN]) {
			state.action = LEVEL_END;
		}

		// -- textboxes etc
		checkMessages();

		if (state.completion == 1.0) {
			if (! state.completionTime)
				state.completionTime = state.t0;

			// other end of level activities
		}

		if (state.timeOfDeath) {
			state.deathRatio = Math.min(1.0, (state.t0 - state.timeOfDeath) / 2000);

			if (state.deathRatio == 1.0) {
				--state.levelIndex;
				state.action = LEVEL_LOADNEXT;
			}
		}
	}

	function loadLevel(index, done) {
		state.entities = [];

		state.map = MapData("level" + index);
		state.map.load(function() {
			// -- bg tiles
			state.exposedTiles = state.map.layers[0].countExposedTiles();
			state.tarnishedTiles = 0;
			state.completion = 0;
			state.completionTime = 0;

			// perishables and hearts
			state.map.layers[1].eachTile(function(row, col, tilex) {
				var per;
				if (tilex == 9) { // heart
					--state.exposedTiles; // can't corrupt floor under the hearts
					per = HeartEntity(state, {
						locX: col * TILE_DIM,
						locY: ((row + 1) * TILE_DIM) - 1,
					});
				}
				else {
					per = BackgroundEntity(state, {
						locX: col * TILE_DIM,
						locY: ((row + 1) * TILE_DIM) - 1,
						tilex: tilex - 1,
					});
				}
				state.entities.push(per);
			});

			done();
		});
	}

	function startLevel(index, done) {
		state.bile = 100;
		state.disgust = 0;
		state.deathRatio = 0;
		state.timeOfDeath = 0;

		loadLevel(state.levelIndex, function() {
			switch (state.levelIndex) {
				case 1:
					// enemies
					state.entities.push(FuzzleEntity(state, { locX: 100, locY: 50 }));
					state.entities.push(FuzzleEntity(state, { locX: 350, locY: 40 }));
					state.entities.push(FuzzleEntity(state, { locX: 600, locY: 40 }));

					state.entities.push(FuzzleEntity(state, { locX: 100, locY: 165 }));
					state.entities.push(FuzzleEntity(state, { locX: 270, locY: 160 }));
					state.entities.push(FuzzleEntity(state, { locX: 360, locY: 180 }));
					break;

				case 2:
					// enemies
					state.entities.push(FuzzleEntity(state, { locX: 75, locY: 110 }));
					state.entities.push(FuzzleEntity(state, { locX: 220, locY: 130 }));
					state.entities.push(FuzzleEntity(state, { locX: 380, locY: 100 }));
					state.entities.push(FuzzleEntity(state, { locX: 610, locY: 60 }));
					break;


				case FINAL_LEVEL:
					// enemies
					state.entities.push(PetEntity(state, { locX: 550, locY: 140 }));
					break;

				default: break;
			}

			// player
			state.player = PlayerEntity(state, { locX: 20, locY: 10 });
			state.entities.push(state.player);

			done();
		});
	}

	function init(theState, done) {
		state = theState;
		done();
	}

	return { init: init, step: step, startLevel: startLevel };
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
			loadSounds({
				die: "die.wav", hit: "playerhit.wav",
				jump: "jump.wav", land: "land.wav",
				splat: "splat.wav",
				fuzzledie: "fuzzledie2.wav"
			}, done);
		} catch(e) {
			if (! audio)
				alert("This browser does not have support for the current Web Audio API.\nPlease use Chrome or Safari to play with sound.\nMy apologies for this inconvenience.");
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
	var FADE_DURATION = 500;

	var state = {
			action: LEVEL_START,
			fadeStart: 0,
			t0: 0,
			keys: {},
			levelIndex: -1
		},
		active = true;

	function step() {
		var t = Date.now(), dt = (t - state.t0) / 1000;
		state.t0 = t; //dt = 0.002;

		// -- limit slowness to 20fps for physics reasons
		if (dt > 50)
			dt = 50;

		if (state.action == LEVEL_LOADNEXT) {
			++state.levelIndex;

			Game.startLevel(state.levelIndex, function() {
				state.t0 = Date.now();
				View.levelChanged();

				state.action = LEVEL_START;
			});

			state.action = LEVEL_LOADING;
		}

		if (state.action == LEVEL_START) {
			state.action = LEVEL_FADEIN;
			state.fadeStart = state.t0;
		}
		if (state.action == LEVEL_END) {
			state.action = LEVEL_FADEOUT;
			state.fadeStart = state.t0;
		}

		if ((state.action == LEVEL_PLAY || state.action == LEVEL_FADEOUT) && active)
			Game.step(dt);

		if (state.action != LEVEL_LOADNEXT && state.action != LEVEL_LOADING)
			View.render();

		if (state.action == LEVEL_MESSAGE) {
			View.drawTextBox(state.msgTitle, state.msgText);
			if (state.keys[KEY_RETURN])
				state.action = LEVEL_PLAY;
		}

		if (state.action == LEVEL_FADEIN || state.action == LEVEL_FADEOUT) {
			var fade = Math.min(1.0, (state.t0 - state.fadeStart) / FADE_DURATION);

			if (state.action == LEVEL_FADEIN) {
				View.drawDimmer(1.0 - fade);
				if (fade == 1.0)
					state.action = LEVEL_PLAY;
			}
			else {
				View.drawDimmer(fade);
				if (fade == 1.0)
					state.action = LEVEL_LOADNEXT;
			}
		}

		fnRequestAnimationFrame(step);
	}

	function start() {
		state.action = LEVEL_LOADNEXT;
		step();
	}

	function init(newCtx) {
		window.onkeydown = function(e){
			var kc = e.keyCode;
			if (! state.keys[kc]) {
				state.keys[kc] = true;

				// DEBUG
				var kc0 = 48;
				if (state.action == LEVEL_PLAY && (kc >= kc0 && kc <= kc0 + FINAL_LEVEL)) {
					state.levelIndex = kc - kc0 - 1;
					state.action = LEVEL_LOADNEXT;
				}
				// DEBUG
			}
		};
		window.onkeyup = function(e){
			var kc = e.keyCode;
			state.keys[kc] = false;
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