import {Windy, WindDB} from "./windy.js"
import {Sailboat} from "./sailboat.js"

const FRAME_RATE = 60;

// desired width and height in pixels
function resizeCanvas(canvas, canvasWidth, canvasHeight) {
    var ctx = canvas.getContext('2d')
    if (window.devicePixelRatio > 1) {

        canvas.width = canvasWidth * window.devicePixelRatio;
        canvas.height = canvasHeight * window.devicePixelRatio;
        canvas.style.width = canvasWidth + "px";
        canvas.style.height = canvasHeight + "px";

        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
}

var windCanvas = document.getElementById('windyMap')

const coastline = new ol.style.Style({
    stroke: new ol.style.Stroke({
        color: 'white',
        width: 1,
    }),
});

var map = new ol.Map({
    layers: [
        new ol.layer.VectorTile({
            source: new ol.source.VectorTile({
                format: new ol.format.MVT({ layerName: 'layer', layers: ['Coastline'] }),
                url: 'https://basemaps.arcgis.com/v1/arcgis/rest/services/World_Basemap/VectorTileServer/tile/{z}/{y}/{x}.pbf',
            }),
            style: coastline
        })
    ],
    interactions: new ol.interaction.defaults.defaults({
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
    target: olMap,
    view: new ol.View({
        center: [0, 0],
        zoom: 1
    }),
    pixelRatio: window.pixelRatio
});
// Transform from longitude,latitude to screen coordinates.
var project_cb = function (lon, lat) {
    return map.getPixelFromCoordinate(ol.proj.fromLonLat([lon, lat], 'EPSG:3857'))
}

var windy;
function refreshWindy() {
    if (!windy) {
        return;
    }

    windy.stop();

    var mapSize = map.getSize();
    var extent = map.getView().calculateExtent(mapSize);
    extent = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326')

    resizeCanvas(windCanvas, mapSize[0], mapSize[1]);
    resizeCanvas(gameCanvas, mapSize[0], mapSize[1])

    windy.start(
        project_cb,
        extent
    );
}

map.on('moveend', refreshWindy);

var gameCanvas = document.getElementById('gameMap')

document.addEventListener("keydown", keyDownEvent)

var s; // forward-declare

var step = 5
function keyDownEvent(e) {
    switch (e.keyCode) {
      case 37: // left / a
      case 65:
        s.rudder = Math.max( s.rudder-1, -1);
        break;
      case 38: // up / w
      case 87:
        s.drifting = false;
        break;
      case 39: // right / d
      case 68:
        s.rudder = Math.min( s.rudder+1, 1);
        break;
      case 40: // down
      case 83:
        s.drifting = true;
        break;
      case 32:
        if(gameActive == true) {
            pauseGame();
        }
        else {
            // pass
        }
        break;
    }
}

fetch('./gfs.json').then(function (response) {
    return response.json();
}).then(function (json) {
    var wind_db = new WindDB( json )

    windy = new Windy({ wind_db: wind_db});

    s = new Sailboat(wind_db, project_cb);
    s.lon = 0;
    s.lat = 0;
    s.hdg = Math.PI/16;

    refreshWindy();
    
    animate();

});

function animate () {

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