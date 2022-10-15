export {Windy, WindDB};

const VELOCITY_SCALE = 5;                   // scale for wind velocity (arbitrary)
const MAX_PARTICLE_NUM = 5000;
const MAX_WIND_INTENSITY = 40;                // wind velocity at which particle intensity is maximum (m/s)
const PARTICLE_LINE_WIDTH = 2;                // line width of a drawn particle
const EARTH_R = 6371229;                      // radius in meters
const BLACK_THRESHOLD = 0.1                    // alpha of RGBA to turn to black
const RESPAWN_PROB = 0.05
var VELOCITY;                                   // particle speed, set from extent area

const defaultRampColors = [
    [0.0, 0x3288bd],
    [0.1, 0x66c2a5],
    [0.3, 0xe6f598],
    [0.2, 0xabdda4],
    [0.4, 0xfee08b],
    [0.5, 0xfdae61],
    [0.6, 0xf46d43],
    [1.0, 0xd53e4f],
    [Infinity, 0xd53e4f]
];

var Windy = function (params) {

    // create a wind database
    var wind_db = params.wind_db;

    // create a bunch of particles
    var particles = [];

    var project; // function to lon,lat to pixels, initialized later

    function animate_frame ( canvas ) {

        // a list of [line, color] pairs
        var lines_colors = []
        // update each of the particles, recording their motions
        for (var i = 0; i < particles.length; ++i) {

            var p = particles[i]
            var old_lon = p.lon, old_lat = p.lat
            var c1 = [p.x, p.y]

            // find the velocity at the particle's location
            var v = wind_db(old_lon, old_lat)
            
            // move the particle, updating its location
            p.update(v[0], v[1], VELOCITY)

            // store the line segment from the move
            if (isNaN(c1[0]) ) {
                c1 = project(old_lon, old_lat);
            }
            var c2 = project(p.lon, p.lat)
            var line = {
                x: c1[0], 
                y: c1[1], 
                xt: c2[0],
                yt: c2[1]
            }
            if ( ! p.justRespawned ) {
                lines_colors.push([line, windColorMap(v[2])])
            }
        }

        // Fade existing particle trails.
        var g = canvas.getContext("2d");
        var prev = g.globalCompositeOperation;
        g.imageSmoothingEnabled = false;
        g.lineWidth = PARTICLE_LINE_WIDTH;
        g.fillStyle = "rgba(1, 1, 1, 0.97)"
        g.globalCompositeOperation = "destination-in";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalCompositeOperation = prev;
        g.globalAlpha = 1

        // Threshold out ghosted trails from alpha FP error
        // var imageData = g.getImageData(0, 0, canvas.width, canvas.height)
        // var data = imageData.data
        // for (let i = 0; i < data.length; i += 4) {
        //     if ( data[i+3] < BLACK_THRESHOLD ) {
        //         data[i] = data[i+1] = data[i+2] = data[i+3]= 0;
        //     }
        // }
        // g.putImageData(imageData, 0, 0)

        // Draw new particle trails.
        lines_colors.forEach(function (line_color, i) {
            var line = line_color[0]
            var color = line_color[1]

            g.beginPath();
            g.strokeStyle = color;
            g.moveTo(line.x, line.y);
            g.lineTo(line.xt, line.yt);
            g.stroke();
        });

    }

    var start = function (project_tf, extent) {
        project = project_tf

        VELOCITY = Math.pow(extent[2] - extent[0], 0.5) * 
            Math.pow(extent[3] - extent[1], 0.5) * VELOCITY_SCALE
        
        for (var i = 0; i < MAX_PARTICLE_NUM; i++) {
            particles.push(new Particle(extent));
            particles[i].respawn()
        }

    };

    var stop = function () {
        particles = []
    };

    var windy = {
        params: params,
        start: start,
        stop: stop,
        animate_frame: animate_frame
    };

    return windy;
}

/**
 * A linear interpolator for hex colors.
 *
 * Based on:
 * https://gist.github.com/rosszurowski/67f04465c424a9bc0dae
 *
 * @param {Number} a  (hex color start val)
 * @param {Number} b  (hex color end val)
 * @param {Number} amount  (the amount to fade from a to b)
 *
 * @example
 * // returns 0x7f7f7f
 * lerpColor(0x000000, 0xffffff, 0.5)
 *
 * @returns {Number}
 */
function lerpColor(a, b, amount) {
    const ar = a >> 16,
        ag = a >> 8 & 0xff,
        ab = a & 0xff,

        br = b >> 16,
        bg = b >> 8 & 0xff,
        bb = b & 0xff,

        rr = ar + amount * (br - ar),
        rg = ag + amount * (bg - ag),
        rb = ab + amount * (bb - ab);

    return `#${((rr << 16) + (rg << 8) + (rb | 0)).toString(16).padStart(6, '0').slice(-6)}`
};

function windColorMap(wind) {
    // convert to 0 - 1 scale
    var frac = Math.abs(wind / MAX_WIND_INTENSITY)
    var remainder;

    // find color that is above and below this fraction
    var lower, upper;
    for (let i=0; i < defaultRampColors.length; ++i) {
        if (frac > defaultRampColors[i][0]){
            var bot = defaultRampColors[i][0];
            var top = defaultRampColors[i+1][0];
            lower = defaultRampColors[i][1];
            upper = defaultRampColors[i+1][1];
            remainder = (frac - bot) / (top - bot)
        }
    }

    // linear interpolate
    var hex = lerpColor(lower, upper, remainder)
    return hex;
}

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

class Particle {

    constructor (extent) {
        this.lon = 0;
        this.lat = 0;
        this.extent = extent;
        this.justRespawned = false;
        this.x = NaN
        this.y = NaN
    }

    respawn = function () {
        var ex = this.extent
        this.lon = ex[0] + Math.random() * (ex[2] - ex[0]);
        this.lat = ex[1] + Math.random() * (ex[3] - ex[1]);
        this.justRespawned = true;
        this.x = NaN; 
        this.y = NaN;
    }

    move = function (u, v, dt) {
        this.lon = this.lon + u * 180 / (Math.PI * EARTH_R * Math.cos(this.lat * Math.PI/180)) * dt
        this.lat = this.lat + v * 180 / (Math.PI * EARTH_R ) * dt

        if (this.lat > 90 || this.lat < -90 ||
            this.lon > 180 || this.lon < -180 ) {
                this.respawn()
        }
    }

    update = function (u, v, dt) {
        this.justRespawned = false;
        this.move(u, v, dt)
        if (Math.random() < RESPAWN_PROB){
            this.respawn()
        }
    }
}