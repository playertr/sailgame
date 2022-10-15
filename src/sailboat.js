export {Sailboat}

const EARTH_R = 6371229;                      // radius in meters
const VELOCITY_SCALE = 50000;
const FRAME_RATE = 60;
const RUDDER_SCALE = 1;

class Sailboat{

    constructor(wind_db, projection) {
        this.projection = projection
        this.wind_db = wind_db
        this.lat = 0 // deg
        this.lon = 0 // deg
        this.hdg = 0 // rad CW of geo North
        this.rudder = 0;
        this.drifting = false;
        this.shape_coords = [
            [-1, 1],
            [-1, -1],
            [2, 0]
        ]
        this.polars = [ // degrees off wind vs. windspeed multiple
            [0, 0.1],
            [30, 1],
            [60, 1.5],
            [90,  2],
            [140, 2],
            [180, 1]
        ]
    }

    // find the boat's velocity, given the wind's lat-lon velocity
    // vector (m/s) and the boat's heading (degrees CW from North)
    find_velocity(wind, drifting) {
        
        // allow the boat to drift with the wind
        if ( drifting ) { return wind; }

        // we assume that the boat will go in the same direction 
        // as its heading, with a speed that depends on the relative
        // wind angle, according to the boat's 'polar diagram'. 
        // This neglects leeway and the effect of apparent wind angle.

        var wind_hdg = Math.PI/2 - Math.atan2(-wind[1], -wind[0]);
        var wind_angle = Math.min( // exercise for the reader
            Math.abs(wrap_pi(this.hdg - wind_hdg)), 
            Math.abs(wrap_pi(wind_hdg - this.hdg))
        ) * 180 / Math.PI;

        // interpolate between polar increments
        var lower, upper, remainder;
        for (let i=0; i < this.polars.length-1; ++i) {
            if (wind_angle > this.polars[i][0]){
                var bot = this.polars[i][0];
                var top = this.polars[i+1][0];
                lower = this.polars[i][1];
                upper = this.polars[i+1][1];
                remainder = (wind_angle - bot) / (top - bot);
            }
        }

        var wind_multiple = lower + remainder * (upper - lower);
        var theta = Math.PI/2 - this.hdg;
        var ret = [
            Math.cos(theta) * wind_multiple * wind[2],
            Math.sin(theta) * wind_multiple * wind[2]
        ];

        return ret;
    }

    // find how latitude and longitude vary with time
    // (not, strictly speaking, a velocity)
    find_lon_lat_dt(vel, dt) {
        return [
            vel[0] * 180 / (Math.PI * EARTH_R * Math.cos(this.lat * Math.PI/180)) * dt,
            vel[1] * 180 / (Math.PI * EARTH_R ) * dt
        ];
    }

    // change lat, lon, and heading given the present wind
    // and whether or not the user is drifting.
    move(canvas) {

        var dt = 1 / FRAME_RATE;

        // steer the boat
        this.hdg += this.rudder * dt * RUDDER_SCALE;

        // move the boat
        var vel = this.find_velocity(this.wind_db(this.lon, this.lat), this.drifting)

        var lon_lat_dt = this.find_lon_lat_dt(vel, dt * VELOCITY_SCALE)

        this.lon += lon_lat_dt[0]
        this.lat += lon_lat_dt[1]

        // handle projection discontinuities
        this.lon = wrap_180(this.lon)

        if (this.lat > 90 ) {
            this.lat = 90;
        }
        if (this.lat < -90 ) {
            this.lat = -90;
        }

        this.hdg = wrap_pi(this.hdg)

        this.drawSpeed(canvas, lon_lat_dt)
    }

    // draw a line from the bow for how fast it is
    drawSpeed(canvas, lonlatdt, fillstyle="white", strokestyle="white") {
        var ctx = canvas.getContext('2d', { willReadFrequently: true });

        var pixels = this.projection(this.lon, this.lat);
        var x = pixels[0];
        var y = pixels[1];

        ctx.fillStyle = "white";
        ctx.strokeStyle = "white";
        ctx.lineWidth = 5;

        var s = 50000000 / VELOCITY_SCALE;
    
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lonlatdt[0] * s, y - lonlatdt[1] * s)
        ctx.stroke();
    }


    // draw the given list of coords
    draw(canvas, fillstyle="white", strokestyle="white") {

        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var coords = this.shape_coords;
        coords = scale(coords, 20);
        
        var pixels = this.projection(this.lon, this.lat);
        var x = pixels[0];
        var y = pixels[1];

        var wind = this.wind_db(this.lon, this.lat)
        if (isNaN(wind[0])) {
            wind = this.wind_db(this.lon, this.lat)
        }

        // the boat's graphics is facing East, not North, so we
        // need to transform angle into degrees CW of East.
        var angle = this.hdg - Math.PI / 2
        coords = rotate(coords, angle);
        coords = translate(coords, x, y);
        draw_coords(ctx, coords, fillstyle, strokestyle);
    }

    animate_frame( canvas) {

        this.draw(canvas)
        this.move(canvas)
    }
}

// expand about origin by scale factor s
function scale(coords, s) {
    var new_coords = [];
    coords.forEach(function (coord) {
        new_coords.push([
            coord[0] * s,
            coord[1] * s
        ]);
    })
    return new_coords;
}

// rotate about origin by lambda radians CW
function rotate(coords, lambda) {
    var new_coords = []
    var c = Math.cos(lambda)
    var s = Math.sin(lambda)
    coords.forEach(function (coord) {
        new_coords.push([
            c * coord[0] - s * coord[1],
            s * coord[0] + c * coord[1]
        ])
    })
    return new_coords;
}

// translate x to the right and y up
function translate(coords, dx, dy) {
    var new_coords = [];
    coords.forEach(function (coord) {
        new_coords.push([
            coord[0] + dx,
            coord[1] + dy
        ]);
    })
    return new_coords;
}

// draw the given list of coords
function draw_coords(ctx, coords, fillstyle="white", strokestyle="white") {
    ctx.fillStyle = fillstyle;
    ctx.strokeStyle = strokestyle;

    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    for ( let i=1; i < coords.length; ++i ) {
        ctx.lineTo(coords[i][0], coords[i][1])
    }
    ctx.fill();
}

// wrap to within [-pi, pi]
function wrap_pi(x) {
    while (x > Math.PI) {
        x -= 2*Math.PI;
    }
    while (x < -Math.PI) {
        x += 2*Math.PI;
    }
    
    return x

}

function wrap_180(x) {
    while (x > 180) {
        x -= 360;
    }
    while (x < -180) {
        x += 360;
    }
    
    return x

}