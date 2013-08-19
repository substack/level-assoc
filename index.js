var bytewise = require('bytewise');
var Transform = require('readable-stream/transform');
var foreignKey = require('foreign-key');

module.exports = Assoc;
function Assoc (db) {
    if (!(this instanceof Assoc)) return new Assoc(db);
    this.db = db;
    this._sublevel = db.sublevel('associations');
    this._foreign = {};
    this._has = [];
    this._hasKeys = {};
}

Assoc.prototype.add = function (key) {
    this._foreign[key] = foreignKey([ 'type', key ]);
    this._hasKeys[key] = {};
    
    var self = this;
    return new Type(function (k, type) {
        self._has.push([ type, k, key ]);
        self._hasKeys[key][k] = type;
        self._foreign[key].add(k, type, key);
    });
};

Assoc.prototype._PUT = function (key, value) {
    if (!value) return;
    for (var i = 0, li = this._has.length; i < li; i++) {
        var ts = this._has[i][0];
        var cur = value;
        for (var cur, j = 0, lj = ts.length - 1; j < lj; j++) {
            cur = cur[ts[j]];
            if (cur === undefined) break;
        }
        if (j !== lj || cur !== ts[j]) continue;
        
        var topKey = this._has[i][2];
        var fkey = this._foreign[topKey].keyList(key, value);
        if (fkey) {
            var k = bytewise.encode([topKey].concat(fkey)).toString('hex');
            this._sublevel.put(k, 0);
        }
    }
};

Assoc.prototype.get = function (topKey, cb) {
    var self = this;
    this.db.get(topKey, function (err, row) {
        if (err) return cb(err);
        
        var keyTypes = self._hasKeys[row.type];
        var foreign = self._foreign[row.type];
        
        Object.keys(keyTypes).forEach(function (key) {
            var type = keyTypes[key];
            
            row[key] = function () {
                var start = [ row.type, topKey, key ];
                var end = [ row.type, topKey, key, undefined ];
                
                var opts = {
                    start: bytewise.encode(start).toString('hex'),
                    end: bytewise.encode(end).toString('hex')
                };
                var tr = new Transform({ objectMode: true });
                tr._transform = function (row, enc, next) {
                    var parts = bytewise.decode(Buffer(row.key, 'hex'));
                    self.db.get(parts[3], function (err, value) {
                        if (err) return next(err);
                        tr.push({ key: parts[3], value: value });
                        next();
                    });
                };
                tr._flush = function (next) {
                    next();
                };
                return self._sublevel.createReadStream(opts).pipe(tr);
            };
        });
        
        cb(null, row);
    });
};

function Type (cb) {
    this._cb = cb;
}

Type.prototype.hasMany = function (key, type) {
    if (typeof type === 'string') type = [ 'type', type ];
    this._cb(key, type);
    return this;
};

Type.prototype.belongsTo = function (type, key) {
    if (key === undefined && typeof type === 'string') key = [ type ];
    if (typeof type === 'string') type = [ 'type', type ];
    if (key === undefined) throw new Error(
        '`key` cannot be inferred with a non-string type.'
        + ' Specify a key.'
    );
    return this;
};
