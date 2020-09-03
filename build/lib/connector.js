"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connector = void 0;
const Modbus = require('jsmodbus');
const net_1 = require("net");
const parameters_1 = require("./schwoerer/parameters");
class Connector {
    constructor(ventcube, server, port, interval = 30) {
        this.socketIsConnected = false;
        this.connectionStatus = Connector.State.DISCONNECTED;
        this.server = server;
        this.port = port;
        this.readInterval = interval;
        this.socket = new net_1.Socket();
        this.client = new Modbus.client.TCP(this.socket);
        this.context = ventcube;
    }
    connect() {
        this.context.log.info("Connecting to server " + this.server + ":" + this.port);
        this.socket.connect({ host: this.server, port: this.port });
        this.connectionStatus = Connector.State.CONNECTING;
        this.socket.setKeepAlive(true, 5000);
    }
    handleErrors(err) {
        if (Modbus.errors.isUserRequestError(err)) {
            switch (err.err) {
                case 'OutOfSync':
                case 'Protocol':
                case 'Timeout':
                case 'ManuallyCleared':
                case 'ModbusException':
                case 'Offline':
                case 'crcMismatch':
                    this.context.log.error('Error Message: ' + err.message + 'Error' + 'Modbus Error Type: ' + err.err);
                    break;
            }
        }
        else if (Modbus.errors.isInternalException(err)) {
            this.context.log.error('Error Message: ' + err.message + 'Error Name:' + err.name + 'Error Stack: ' + err.stack);
        }
        else {
            this.context.log.error('Unknown Error:' + err);
        }
    }
    initializeSocket() {
        this.socket.on('connect', () => {
            this.connectionStatus = Connector.State.CONNECTED;
            this.context.log.info("Established connection. Starting processing");
            this.readFunctionStates(this.context.syncReadData.bind(this.context));
        });
        this.socket.on('timeout', () => {
            this.connectionStatus = Connector.State.TIMEDOUT;
        });
        this.socket.on('close', () => {
            this.connectionStatus = Connector.State.CLOSED;
        });
        this.socket.on('error', (error) => {
            this.context.log.error("ERROR: " + error);
        });
    }
    readFunctionStates(callback) {
        this.context.log.debug("Reading latest states from Ventcube");
        for (const [func, attributes] of Object.entries(parameters_1.SchwoererParameter)) {
            let mayRead = attributes.modbus_r > -1 ? true : false;
            if (mayRead) {
                this.context.log.debug("checking state: " + func + ":" + attributes.modbus_r);
                this.readDataFromHoldingRegister(callback, func, attributes.modbus_r);
            }
        }
        setTimeout(function () { this.readFunctionStates(callback); }.bind(this), this.readInterval * 1000);
    }
    readDataFromHoldingRegister(callback, func, register, fields = 1) {
        this.context.log.silly("Reading register: " + register);
        this.client.readHoldingRegisters(register, fields)
            .then(({ metrics, request, response }) => {
            this.context.log.silly('Transfer Time: ' + metrics.transferTime);
            this.context.log.silly('Response Body Payload: ' + response.body.valuesAsArray);
            callback(func, response.body.valuesAsArray, new Date());
        })
            .catch((error) => {
            this.context.log.error(error.message);
        });
    }
    writeDataToRegister(func, register, value) {
        this.context.log.info('Changing register ' + register + ' value to: ' + value + "|" + value.toString(16));
        //Convert value from decimal to hexadecimal to write it to register
        this.client.writeMultipleRegisters(register, [value.toString(16)])
            .then(({ metrics, request, response }) => {
            this.context.log.info('Transfer Time: ' + metrics.transferTime);
            this.context.log.info('Response Function Code: ' + response.body.fc);
            this.context.syncReadData(func, value, new Date());
        })
            .catch((error) => {
            this.context.log.error(error.message + "Response: " + error.response.body.message + " code: " + error.response.body.code);
        });
    }
    getConnectionStatus() {
        return this.connectionStatus;
    }
    close() {
        this.socket.end();
    }
}
exports.Connector = Connector;
(function (Connector) {
    let State;
    (function (State) {
        State[State["CONNECTING"] = 0] = "CONNECTING";
        State[State["CONNECTED"] = 1] = "CONNECTED";
        State[State["DISCONNECTED"] = 2] = "DISCONNECTED";
        State[State["TIMEDOUT"] = 3] = "TIMEDOUT";
        State[State["CLOSED"] = 4] = "CLOSED";
    })(State = Connector.State || (Connector.State = {}));
})(Connector = exports.Connector || (exports.Connector = {}));
