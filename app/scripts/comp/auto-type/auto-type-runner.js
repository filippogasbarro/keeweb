'use strict';

var Format = require('../../util/format');

var AutoTypeRunner = function(ops) {
    this.ops = ops;
    this.pendingResolvesCount = 0;
    this.entry = null;
    this.now = new Date();
};

AutoTypeRunner.PendingResolve = { pending: true };

AutoTypeRunner.Keys = {
    tab: 'tab', enter: 'enter', space: 'space',
    up: 'up', down: 'down', left: 'left', right: 'right', home: 'home', end: 'end', pgup: 'pgup', pgdn: 'pgdn',
    insert: 'ins', ins: 'ins', delete: 'del', del: 'del', backspace: 'bs', bs: 'bs', bksp: 'bs', esc: 'esc',
    win: 'win', lwin: 'win', rwin: 'rwin', f1: 'f1', f2: 'f2', f3: 'f3', f4: 'f4', f5: 'f5', f6: 'f6',
    f7: 'f7', f8: 'f8', f9: 'f9', f10: 'f10', f11: 'f11', f12: 'f12', f13: 'f13', f14: 'f14', f15: 'f15', f16: 'f16',
    add: 'add', subtract: 'subtract', multiply: 'multiply', divide: 'divide',
    numpad0: 'n0', numpad1: 'n1', numpad2: 'n2', numpad3: 'n3', numpad4: 'n4',
    numpad5: 'n5', numpad6: 'n6', numpad7: 'n7', numpad8: 'n8', numpad9: 'n9'
};

AutoTypeRunner.Substitutions = {
    title: function(runner, op) { return runner.getEntryFieldKeys('Title', op); },
    username: function(runner, op) { return runner.getEntryFieldKeys('UserName', op); },
    url: function(runner, op) { return runner.getEntryFieldKeys('URL', op); },
    password: function(runner, op) { return runner.getEntryFieldKeys('Password', op); },
    notes: function(runner, op) { return runner.getEntryFieldKeys('Notes', op); },
    group: function(runner) { return runner.getEntryGroupName(); },
    totp: function(runner, op) { return runner.getOtp(op); },
    s: function(runner, op) { return runner.getEntryFieldKeys(op.arg, op); },
    'dt_simple': function(runner) { return runner.dt('simple'); },
    'dt_year': function(runner) { return runner.dt('Y'); },
    'dt_month': function(runner) { return runner.dt('M'); },
    'dt_day': function(runner) { return runner.dt('D'); },
    'dt_hour': function(runner) { return runner.dt('h'); },
    'dt_minute': function(runner) { return runner.dt('m'); },
    'dt_second': function(runner) { return runner.dt('s'); },
    'dt_utc_simple': function(runner) { return runner.udt('simple'); },
    'dt_utc_year': function(runner) { return runner.udt('Y'); },
    'dt_utc_month': function(runner) { return runner.udt('M'); },
    'dt_utc_day': function(runner) { return runner.udt('D'); },
    'dt_utc_hour': function(runner) { return runner.udt('h'); },
    'dt_utc_minute': function(runner) { return runner.udt('m'); },
    'dt_utc_second': function(runner) { return runner.udt('s'); }
};

AutoTypeRunner.Commands = {
    wait: function() {},
    setDelay: function() {}
};

AutoTypeRunner.prototype.resolve = function(entry, callback) {
    this.entry = entry;
    try {
        this.resolveOps(this.ops);
        if (!this.pendingResolvesCount) {
            callback();
        } else {
            this.resolveCallback = callback;
        }
    } catch (e) {
        return callback(e);
    }
};

AutoTypeRunner.prototype.resolveOps = function(ops) {
    for (var i = 0, len = ops.length; i < len; i++) {
        this.resolveOp(ops[i]);
    }
};

AutoTypeRunner.prototype.resolveOp = function(op) {
    if (op.type === 'group') {
        this.resolveOps(op.value);
        return;
    }
    if (op.value.length === 1 && !op.sep) {
        // {x}
        op.type = 'text';
        return;
    }
    if (op.value.length === 1 && op.sep === ' ') {
        // {x 3}
        op.type = 'text';
        var ch = op.value, text = ch, len = +op.arg;
        while (text.length < len) {
            text += ch;
        }
        op.value = text;
        return;
    }
    var lowerValue = op.value.toLowerCase();
    var key = AutoTypeRunner.Keys[lowerValue];
    if (key) {
        if (op.sep === ' ' && +op.arg > 0) {
            // {TAB 3}
            op.type = 'group';
            op.value = [];
            var count = +op.arg;
            for (var i = 0; i < count; i++) {
                op.value.push({type: 'key', value: key});
            }
        } else {
            // {TAB}
            op.type = 'key';
            op.value = key;
        }
        return;
    }
    var substitution = AutoTypeRunner.Substitutions[lowerValue];
    if (substitution) {
        // {title}
        op.type = 'text';
        op.value = substitution(this, op);
        if (op.value === AutoTypeRunner.PendingResolve) {
            this.pendingResolvesCount++;
        }
        return;
    }
    if (!this.tryParseCommand(op)) {
        throw 'Bad op: ' + op.value;
    }
};

AutoTypeRunner.prototype.tryParseCommand = function(op) {
    switch (op.value.toLowerCase()) {
        case 'clearfield':
            // {CLEARFIELD}
            op.type = 'group';
            op.value = [{ type: 'key', value: 'a', mod: { '^': true } }, { type: 'key', value: 'bs' }];
            return true;
        case 'vkey':
            // {VKEY 10} {VKEY 0x1F}
            op.type = 'key';
            op.value = parseInt(op.arg);
            if (isNaN(op.value) || op.value <= 0) {
                throw 'Bad vkey: ' + op.arg;
            }
            return true;
        case 'delay':
            // {DELAY 5} {DELAY=5}
            op.type = 'cmd';
            op.value = op.sep === '=' ? 'setDelay' : 'wait';
            if (!op.arg) {
                throw 'Delay requires seconds count';
            }
            if (isNaN(+op.arg)) {
                throw 'Bad delay: ' + op.arg;
            }
            if (op.arg <= 0) {
                throw 'Delay requires positive interval';
            }
            op.arg = +op.arg;
            return true;
        default:
            return false;
    }

};

AutoTypeRunner.prototype.getEntryFieldKeys = function(field, op) {
    if (!field) {
        return '';
    }
    field = field.toLowerCase();
    var value = null;
    _.findKey(this.entry.entry.fields, function(val, f) {
        if (f.toLowerCase() === field) {
            value = val;
            return true;
        }
    });
    if (!value) {
        return '';
    }
    if (value.isProtected) {
        op.type = 'group';
        var ops = [];
        value.forEachChar(function(ch) {
            ops.push({ type: 'text', value: String.fromCharCode(ch) });
        });
        return ops.length ? ops : '';
    }
    return value;
};

AutoTypeRunner.prototype.getEntryGroupName = function() {
    return this.entry.group.get('title');
};

AutoTypeRunner.prototype.dt = function(part) {
    switch (part) {
        case 'simple':
            return this.dt('Y') + this.dt('M') + this.dt('D') + this.dt('h') + this.dt('m') + this.dt('s');
        case 'Y':
            return this.now.getFullYear().toString();
        case 'M':
            return Format.pad(this.now.getMonth() + 1, 2);
        case 'D':
            return Format.pad(this.now.getDate(), 2);
        case 'h':
            return Format.pad(this.now.getHours(), 2);
        case 'm':
            return Format.pad(this.now.getMinutes(), 2);
        case 's':
            return Format.pad(this.now.getSeconds(), 2);
        default:
            throw 'Bad part: ' + part;
    }
};

AutoTypeRunner.prototype.udt = function(part) {
    switch (part) {
        case 'simple':
            return this.udt('Y') + this.udt('M') + this.udt('D') + this.udt('h') + this.udt('m') + this.udt('s');
        case 'Y':
            return this.now.getUTCFullYear().toString();
        case 'M':
            return Format.pad(this.now.getUTCMonth() + 1, 2);
        case 'D':
            return Format.pad(this.now.getUTCDate(), 2);
        case 'h':
            return Format.pad(this.now.getUTCHours(), 2);
        case 'm':
            return Format.pad(this.now.getUTCMinutes(), 2);
        case 's':
            return Format.pad(this.now.getUTCSeconds(), 2);
        default:
            throw 'Bad part: ' + part;
    }

};

AutoTypeRunner.prototype.getOtp = function(op) {
    this.entry.initOtpGenerator();
    if (!this.entry.otpGenerator) {
        return '';
    }
    var that = this;
    this.entry.otpGenerator.next(function(otp) {
        that.pendingResolved(op, otp, otp ? undefined : 'OTP error');
    });
    return AutoTypeRunner.PendingResolve;
};

AutoTypeRunner.prototype.pendingResolved = function(op, value, error) {
    var wasPending = op.value === AutoTypeRunner.PendingResolve;
    if (value) {
        op.value = value;
    }
    if (!wasPending) {
        return;
    }
    this.pendingResolvesCount--;
    if ((this.pendingResolvesCount === 0 || error) && this.resolveCallback) {
        this.resolveCallback(error);
        this.resolveCallback = null;
    }
};

AutoTypeRunner.prototype.run = function() {
};

module.exports = AutoTypeRunner;