var Accessory = require('../').Accessory;
var Service = require('../').Service;
var Characteristic = require('../').Characteristic;
var uuid = require('../').uuid;

var dgram = require("dgram");
var dgram = require("dgram");
var os = require('os');

var getIPAddresses = function () {
    var nics = os.networkInterfaces();

    var results = [];
    for (var name in nics) {
        if (!nics.hasOwnProperty(name)) { continue; }
        var nic = nics[name];

        for (var i = 0; i < nic.length; i++) {
            var addy = nic[i];
            if ((addy.family == "IPv4")
                && (addy.address != "127.0.0.1")) {
                results.push(addy.address);
            }
        }
    }
    return results;
};


var PARTICLE_LISTENER = {

    listen: function(onParticleFound) {
        var server = dgram.createSocket("udp4");
        server.on("error", function (err) {
            console.log("server error:\n" + err.stack);
            server.close();
        });
        server.on("message", function (msg, rinfo) {
            var hex = msg.toString('hex');
            var idx = hex.indexOf('ff');
            var id = hex.substring(idx + 2);
            onParticleFound(id, rinfo.address);
        });
        server.on("listening", function () {
            var address = server.address();
            console.log("server listening " + address.address + ":" + address.port);
        });

        var ips = getIPAddresses();
        if (!ips || (ips.length == 0)) {
            console.error("error getting IP address!");
        }
        server.bind(5683, '0.0.0.0', function () {
            for(var i=0;i<ips.length;i++) {
                server.addMembership('224.0.1.187', ips[i]);
            }
        });
    }

};




var PUMPKIN_LIGHT = {
    powerOn: false,
    brightness: 100, // percentage
    hue: 0,
    saturation: 0,

    client: 0,
    lightListener: 0,
    target_ip: 0,
    light_port: 777,

    init: function() {

        var client = dgram.createSocket("udp4");
        client.bind( function() { client.setBroadcast(true) } );
        PUMPKIN_LIGHT.client = client;

        PARTICLE_LISTENER.listen(function(id, ip) {
            console.log("a core just announced itself: id:" + id + " ip address: " + rinfo.address);
            PUMPKIN_LIGHT.target_ip = ip;
        });

    },

    sendCurrent: function() {
        if (PUMPKIN_LIGHT.powerOn) {
            var hue = PUMPKIN_LIGHT.hue / 360;
            var sat = PUMPKIN_LIGHT.saturation / 100;
            var brightness = PUMPKIN_LIGHT.brightness / 100;
            console.log('setting HSL: %d, %d, %d', hue, sat, brightness);
            var arr = PUMPKIN_LIGHT.HSVtoRGB(hue, sat, brightness);
            PUMPKIN_LIGHT.sendRGB(arr[0], arr[1], arr[2]);
        }
        else {
            PUMPKIN_LIGHT.sendRGB(0, 0, 0);
        }
    },

    sendRGB: function(r, g, b) {
        var msg = new Buffer(4);
        var t = "t".charCodeAt(0);
        console.log('Writing to light: %d %d %d %d', t, r, g, b);
        msg.writeUInt8(t, 0);
        msg.writeUInt8(r, 1);
        msg.writeUInt8(g, 2);
        msg.writeUInt8(b, 3);
        PUMPKIN_LIGHT.client.setBroadcast(true);
        PUMPKIN_LIGHT.client.send(msg, 0, msg.length, PUMPKIN_LIGHT.light_port, PUMPKIN_LIGHT.target_ip); //"10.0.2.255");
    },

    HSVtoRGB: function(h, s, v) {
        var r, g, b, i, f, p, q, t;
        if (arguments.length === 1) {
            s = h.s, v = h.v, h = h.h;
        }
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return [
            Math.round(r * 255),
            Math.round(g * 255),
            Math.round(b * 255)
        ];
    },

    setPowerOn: function(on) {
        console.log("Turning the light %s!", on ? "on" : "off");
        PUMPKIN_LIGHT.powerOn = on;
        PUMPKIN_LIGHT.sendCurrent()
    },
    setBrightness: function(brightness) {
        console.log("Setting light brightness to %s", brightness);
        PUMPKIN_LIGHT.brightness = brightness;
        PUMPKIN_LIGHT.sendCurrent()
    },
    setHue: function(hue){
        PUMPKIN_LIGHT.hue = hue;
        PUMPKIN_LIGHT.sendCurrent()
    },
    setSaturation: function(saturation){
        PUMPKIN_LIGHT.saturation = saturation;
        PUMPKIN_LIGHT.sendCurrent()
    },
    identify: function() {
        console.log("Identify the light!");
    }
};

PUMPKIN_LIGHT.init();

var lightUUID = uuid.generate('hap-nodejs:accessories:pumpkin-light');

// This is the Accessory that we'll return to HAP-NodeJS that represents our fake light.
var light = exports.accessory = new Accessory('Pumpkin Light', lightUUID);

light.username = "1A:1A:3C:4D:5E:FF";
light.pincode = "000-11-154";

// set some basic properties (these values are arbitrary and setting them is optional)
light
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, "Christopher Micali")
    .setCharacteristic(Characteristic.Model, "A1")
    .setCharacteristic(Characteristic.SerialNumber, "A1-01");

light.on('identify', function(paired, callback) {
    PUMPKIN_LIGHT.identify();
    callback(); // success
});

// Add the actual Lightbulb Service and listen for change events from iOS.
// We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
light
    .addService(Service.Lightbulb, "Pumpkin") // services exposed to the user should have "names" like "Fake Light" for us
    .getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
        PUMPKIN_LIGHT.setPowerOn(value);
        callback(); // Our fake Light is synchronous - this value has been successfully set
    });

// We want to intercept requests for our current power state so we can query the hardware itself instead of
// allowing HAP-NodeJS to return the cached Characteristic.value.
light
    .getService(Service.Lightbulb)
    .getCharacteristic(Characteristic.On)
    .on('get', function(callback) {

        // this event is emitted when you ask Siri directly whether your light is on or not. you might query
        // the light hardware itself to find this out, then call the callback. But if you take longer than a
        // few seconds to respond, Siri will give up.

        var err = null; // in case there were any problems

        if (PUMPKIN_LIGHT.powerOn) {
            console.log("Are we on? Yes.");
            callback(err, true);
        }
        else {
            console.log("Are we on? No.");
            callback(err, false);
        }
    });

// also add an "optional" Characteristic for Brightness
light
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Brightness)
    .on('get', function(callback) {
        callback(null, PUMPKIN_LIGHT.brightness);
    })
    .on('set', function(value, callback) {
        PUMPKIN_LIGHT.setBrightness(value);
        callback();
    });

light
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Hue)
    .on('get',function(callback){
        callback(null,PUMPKIN_LIGHT.hue);
    })
    .on('set',function(value,callback){
        PUMPKIN_LIGHT.setHue(value);
        callback();
    });

light
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Saturation)
    .on('get',function(callback){
        callback(null,PUMPKIN_LIGHT.saturation);
    })
    .on('set',function(value,callback){
        PUMPKIN_LIGHT.setSaturation(value);
        callback();
    });
