var sub = require('level-sublevel');
var level = require('level-test')();
var db = sub(level('test', { valueEncoding: 'json' }));

var assoc = require('../')(db);
assoc.add('hackerspace')
    .hasMany('hackers', [ 'type', 'hacker' ])
    .hasMany('tools', [ 'type', 'tool' ])
;
assoc.add('hacker').belongsTo('hackerspace');
assoc.add('tool').belongsTo('hackerspace');

db.batch(require('./data.json').map(function (row) {
    return { type: 'put', key: row.key, value: row.value };
}));

assoc.get('sudoroom', function (err, room) {
    console.log(room);
});
