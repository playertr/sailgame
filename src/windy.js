
var MAX_PARTICLE_NUM = 5000;
var VELOCITY_SCALE = 500;                   // scale for wind velocity (completely arbitrary--this value looks nice)
var MAX_WIND_INTENSITY = 40;                // wind velocity at which particle intensity is maximum (m/s)
var MAX_PARTICLE_AGE = 250;                 // max number of frames a particle is drawn before regeneration
var PARTICLE_LINE_WIDTH = 2;                // line width of a drawn particle
var FRAME_RATE = 60;                        // desired milliseconds per frame
var MAX_PARTICLE_AGE = 500;
var EARTH_R = 6371229;                      // radius in meters

/**
 * @returns {Boolean} true if the specified value is not null and not undefined.
 */
 var isValue = function (x) {
    return x !== null && x !== undefined;
}

/**
 * @returns {Number} returns remainder of floored division, i.e., floor(a / n). 
 * Useful for consistent modulo of negative numbers. See
 * http://en.wikipedia.org/wiki/Modulo_operation.
 */
var floorMod = function (a, n) {
    return a - n * Math.floor(a / n);
}


// interpolation for vectors like wind (u,v,m)
var bilinearInterpolateVector = function (x, y, g00, g10, g01, g11) {
    var rx = (1 - x);
    var ry = (1 - y);
    var a = rx * ry, b = x * ry, c = rx * y, d = x * y;
    var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
};

// A database to hold the wind, queriable by (lon,lat).
var WindDB = function (data) {

    // parse through the JSON data, and identify U and V components using their
    // unique combinations of parameterCategory and parameterNumber.
    var uComp = null, vComp = null, scalar = null;

    data.forEach(function (record) {
        switch (record.header.parameterCategory + "," + record.header.parameterNumber) {
            case "2,2": uComp = record; break;
            case "2,3": vComp = record; break;
            default:
                scalar = record;
        }
    });

    var data = function (i) {
        return [uComp.data[i], vComp.data[i]];
    }

    // place the u,v components into a grid.
    var header = uComp.header
    var lon0 = header.lo1, lat0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
    var deltalon = header.dx, deltalat = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
    var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
    var date = new Date(header.refTime);
    date.setHours(date.getHours() + header.forecastTime);

    // Scan mode 0 assumed. Longitude increases from lon0, and latitude decreases from lat0.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
    var grid = [], p = 0;
    var isContinuous = Math.floor(ni * deltalon) >= 360;
    for (var j = 0; j < nj; j++) {
        var row = [];
        for (var i = 0; i < ni; i++, p++) {
            row[i] = data(p);
        }
        if (isContinuous) {
            // For wrapped grids, duplicate first column as last column to simplify interpolation logic
            row.push(row[0]);
        }
        grid[j] = row;
    }

    // create and return a function to interpolate values on the grid
    function interpolate(lon, lat) {
        var i = floorMod(lon - lon0, 360) / deltalon;  // calculate longitude index in wrapped range [0, 360)
        var j = (lat0 - lat) / deltalat;                 // calculate latitude index in direction +90 to -90

        var fi = Math.floor(i), ci = fi + 1;
        var fj = Math.floor(j), cj = fj + 1;

        var row;
        if ((row = grid[fj])) {
            var g00 = row[fi];
            var g10 = row[ci];
            if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
                var g01 = row[fi];
                var g11 = row[ci];
                if (isValue(g01) && isValue(g11)) {
                    // All four points found, so interpolate the value.
                    return bilinearInterpolateVector(i - fi, j - fj, g00, g10, g01, g11);
                }
            }
        }
        return null;
    }

    return interpolate;
}

// restrict angle x to (-m, m)
var wrap_m = function (x, m) {
    while ( x < -m ) { x = x + m }
    while (x > m) { x = x - m }
    return x
}

class Particle {

    constructor (extent) {
        this.lon = 0;
        this.lat = 0;
        this.age = Math.floor(Math.random() * MAX_PARTICLE_AGE);
        this.extent = extent
    }

    respawn = function () {
        var ex = this.extent
        this.lon = ex[0] + Math.random() * (ex[2] - ex[0])
        this.lat = ex[1] + Math.random() * (ex[3] - ex[1]);
    }

    move = function (u, v, dt) {
        this.lon = this.lon + u * 180 / (Math.PI * EARTH_R * Math.cos(this.lat * Math.PI/180)) * dt
        this.lat = this.lat + v * 180 / (Math.PI * EARTH_R ) * dt

        if (this.lat > 90 || this.lat < -90 ||
            this.lon > 180 || this.lon < -180 ) {
                this.age = 0
                this.respawn()
        }
    }

    update = function (u, v, dt) {
        this.move(u, v, dt)
        this.age += 1
        if ( this.age > MAX_PARTICLE_AGE ) {
            this.age = 0
            this.respawn()
        }
    }
}

var Windy = function (params) {


    // create a wind database
    var wind_db = WindDB(params.data)

    // create a bunch of particles
    var particles = []

    function hexToR(h) { return parseInt((cutHex(h)).substring(0, 2), 16) }
    function hexToG(h) { return parseInt((cutHex(h)).substring(2, 4), 16) }
    function hexToB(h) { return parseInt((cutHex(h)).substring(4, 6), 16) }
    function cutHex(h) { return (h.charAt(0) == "#") ? h.substring(1, 7) : h }

    function windIntensityColorScale(maxWind) {

        var result = [

            "rgba(" + hexToR('#3288bd') + ", " + hexToG('#3288bd') + ", " + hexToB('#3288bd') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#66c2a5') + ", " + hexToG('#66c2a5') + ", " + hexToB('#66c2a5') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#abdda4') + ", " + hexToG('#abdda4') + ", " + hexToB('#abdda4') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#e6f598') + ", " + hexToG('#e6f598') + ", " + hexToB('#e6f598') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#fee08b') + ", " + hexToG('#fee08b') + ", " + hexToB('#fee08b') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#fdae61') + ", " + hexToG('#fdae61') + ", " + hexToB('#fdae61') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#f46d43') + ", " + hexToG('#f46d43') + ", " + hexToB('#f46d43') + ", " + 0.5 + ")",
            "rgba(" + hexToR('#d53e4f') + ", " + hexToG('#d53e4f') + ", " + hexToB('#d53e4f') + ", " + 0.5 + ")",
        ]

        result.indexFor = function (m) {  // map wind speed to a style
            return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
        };
        return result;
    }

    function animate () {

        var colorStyles = windIntensityColorScale(MAX_WIND_INTENSITY);
        var buckets = colorStyles.map(function () { return []; });

        // update each of the particles, recording their motions
        for (var i = 0; i < particles.length; i++) {

            var p = particles[i]
            var old_lon = p.lon, old_lat = p.lat

            // find the velocity at the particle's location
            var v = wind_db(old_lon, old_lat)

            // move the particle, updating its location
            p.update(v[0], v[1], VELOCITY_SCALE)

            // store the line segment from the move
            var c1 = project(old_lon, old_lat)
            var c2 = project(p.lon, p.lat)
            var line = {
                x: c1[0], 
                y: c1[1], 
                xt: c2[0],
                yt: c2[1]
            }
            if ( p.age > 1 ) {
                buckets[colorStyles.indexFor(v[2])].push(line);
            }
        }


        // Fade existing particle trails.
        var g = params.canvas.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.lineWidth = PARTICLE_LINE_WIDTH;
        g.globalAlpha = 0.03
        var prev = g.globalCompositeOperation;
        g.fillStyle="black"
        g.globalCompositeOperation = "destination-out";
        g.fillRect(0, 0, params.canvas.width, params.canvas.height);
        g.globalCompositeOperation = prev;
        g.globalAlpha = 1

        // Draw new particle trails.
        buckets.forEach(function (bucket, i) {
            if (bucket.length > 0) {
                g.beginPath();
                g.strokeStyle = colorStyles[i];
                bucket.forEach(function (line) {
                    g.moveTo(line.x, line.y);
                    g.lineTo(line.xt, line.yt);
                });
                g.stroke();
            }
        });

        console.log("requesting animation!")
        try {
            windy.timer = setTimeout(function () {
                requestAnimationFrame(animate);
            }, 1000 / FRAME_RATE);
        }
        catch (e) {
            console.error(e);
        }

    }

    var start = function (project_tf, extent) {
        project = project_tf
        
        for (var i = 0; i < MAX_PARTICLE_NUM; i++) {
            particles.push(new Particle(extent));
            particles[i].respawn()
        }

        console.log("Made it to start!")
        
        animate();
    };

    var stop = function () {
        particles = []
        if (windy.timer) clearTimeout(windy.timer)
    };

    var windy = {
        params: params,
        start: start,
        stop: stop
    };

    return windy;
}

// shim layer with setTimeout fallback
window.requestAnimationFrame = (function () {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 20);
        };
})();