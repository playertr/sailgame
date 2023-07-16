import Map from 'ol/Map.js';
import TopoJSON from 'ol/format/TopoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import View from 'ol/View.js';
import { Stroke, Style, Fill } from 'ol/style.js';
import { Vector as VectorLayer } from 'ol/layer.js';
import { FullScreen, defaults as defaultControls } from 'ol/control.js';
import * as olProj from 'ol/proj';
import { defaults } from 'ol/interaction/defaults';
import { Windy, WindDB } from "./windy.js"
import { Sailboat } from "./sailboat.js"
// ocean data from Natural Earth 50M, online converted to topojson
import ocean_data from './data/topojson/ne_50m_ocean.json'
import wind_data from './data/json/gfs.json'

const FRAME_RATE = 60;

// *****************************************************************************
// Define helper functions. ****************************************************

// Resize the Wind and Game canvases when we zoom in on the olMap canvas
// (takes desired width and height in pixels)
function resizeCanvas(canvas, canvasWidth, canvasHeight) {
  var ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (window.devicePixelRatio > 1) {

    canvas.width = canvasWidth * window.devicePixelRatio;
    canvas.height = canvasHeight * window.devicePixelRatio;
    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
}

// Transform from longitude,latitude to screen coordinates.
var project_fn = function (lon, lat) {
  return map.getPixelFromCoordinate(olProj.fromLonLat([lon, lat], 'EPSG:3857'))
}

// See whether a given pixel is on land
var is_on_land = function (x, y) {
  var on_land = true
  map.forEachFeatureAtPixel([x, y], function (feature, layer) {
    if (feature.getProperties()['featureclass'] == 'Ocean') {
      on_land = false // returning true here didn't work
    }
  })
  return on_land
}

// Restart the wind animation after changing the View and extents
function refreshWindy() {
  if (!windy) {
    return;
  }

  windy.stop();

  var mapSize = map.getSize();
  var extent = map.getView().calculateExtent(mapSize);
  extent = olProj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326')

  resizeCanvas(windCanvas, mapSize[0], mapSize[1]);
  resizeCanvas(gameCanvas, mapSize[0], mapSize[1])

  windy.start(
    project_fn,
    extent
  );
}

// Handle keys
function keyDownEvent(e) {
  switch (e.keyCode) {
    case 37: // left / a
    case 65:
      s.rudder = Math.max(s.rudder - 1, -1);
      break;
    case 38: // up / w
    case 87:
      s.drifting = false;
      break;
    case 39: // right / d
    case 68:
      s.rudder = Math.min(s.rudder + 1, 1);
      break;
    case 40: // down
    case 83:
      s.drifting = true;
      break;
    case 32:
      if (gameActive == true) {
        pauseGame();
      }
      else {
        // pass
      }
      break;
  }
}

// Update the wind animation and sailboat simulation.
// Repeat this on a timed callback.
function animate() {

  windy.animate_frame(windCanvas)
  s.animate_frame(gameCanvas)

  try {
    windy.timer = setTimeout(function () {
      requestAnimationFrame(animate);
    }, 1000 / FRAME_RATE);
  }
  catch (e) {
    console.error(e);
  }
}

// Wrapper around requestAnimationFrame --
// shim layer with setTimeout fallback
window.requestAnimationFrame = (function () {
  return window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function (callback) {
      window.setTimeout(callback, 1000 / 15);
    };
})();

// *****************************************************************************
// Declare variables and generally do stuff.************************************

// Get canvas elements. ********************************************************
var windCanvas = document.getElementById('windyMap')
var gameCanvas = document.getElementById('gameMap')

// Make a map with the oceans outlined in white. *******************************

// define style spec
const ocean = new Style({
  stroke: new Stroke({
    color: 'white',
    width: 1,
  }),
  fill: new Fill({
    color: 'clear'
  })
});

// read in layer from TopoJSON
// I think 3857 is correct, but I'm not sure.
const vector = new VectorLayer({
  source: new VectorSource({
    features: (new TopoJSON()).readFeatures(ocean_data, { featureProjection: 'EPSG:3857' })
  }),
  style: ocean,
});

// make a map object with most interactions disabled
const map = new Map({
  controls: defaultControls().extend([new FullScreen()]),
  layers: [vector],
  target: 'olMap',
  view: new View({
    center: [0, 0],
    zoom: 1,
  }),
  pixelRatio: window.pixelRatio,
  interations: new defaults({
    dragRotate: false,
    doubleClickZoom: false,
    // dragPan: false,
    pinchRotate: false,
    pinchZoom: false,
    dragZoom: false,
    dragAndDrop: false,
    keyboardPan: false,
    keyboardZoom: false,
    // mouseWheelZoom: false,
    pointer: false,
    select: false
  }),
});

// Define map behavior. ********************************************************

map.on('moveend', refreshWindy);
document.addEventListener("keydown", keyDownEvent)

// Make a WindDB: a function from (lon,lat) to (U,V) ***************************
var wind_db = new WindDB(wind_data)

// Make a Windy: a particle-based wind animation *******************************
var windy = new Windy({ wind_db: wind_db });

// Make a Sailboat: a stateful boat simulator **********************************
var s = new Sailboat(wind_db, project_fn, is_on_land);
s.lon = 0;
s.lat = 0;
s.hdg = Math.PI / 16;

// Wait for the first map render, then start the game **************************
map.once('postrender', function () {
  refreshWindy();
  animate();
});
