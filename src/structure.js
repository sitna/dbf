var fieldSize = require('./fieldsize'),
    lib = require('./lib'),
    fields = require('./fields');

/**
 * @param {Array} data
 * @param {Array} meta
 * @returns {Object} view
 */
module.exports = function structure(data, meta) {

    var field_meta = meta || fields.multi(data),
        fieldDescLength = (32 * field_meta.length) + 1,
        bytesPerRecord = fields.bytesPer(field_meta), // deleted flag
        buffer = new ArrayBuffer(
            // field header
            fieldDescLength +
            // header
            32 +
            // contents
            (bytesPerRecord * data.length) +
            // EOF marker
            1
    ),
        now = new Date(),
        view = new DataView(buffer);

    // version number - dBase level 7
    view.setUint8(0, 0x04);
    // date of last update
    view.setUint8(1, now.getFullYear() - 1900);
    view.setUint8(2, now.getMonth() + 1);
    view.setUint8(3, now.getDate());
    // number of records
    view.setUint32(4, data.length, true);

    // length of header
    var headerLength = fieldDescLength + 32;
    view.setUint16(8, headerLength, true);
    // length of each record
    view.setUint16(10, bytesPerRecord, true);

    // Terminator
    view.setInt8(32 + fieldDescLength - 1, 0x0D);

    field_meta.forEach(function(f, i) {
        // field name
        f.name.split('').slice(0, 10).forEach(function(c, x) {
            view.setInt8(32 + i * 32 + x, c.charCodeAt(0));
        });
        // field type
        view.setInt8(32 + i * 32 + 11, f.type.charCodeAt(0));
        // field length
        view.setInt8(32 + i * 32 + 16, f.size);
        if (f.type == 'N') view.setInt8(32 + i * 32 + 17, 3);
    });

    var offset = fieldDescLength + 32;

    data.forEach(function(row, num) {
        // delete flag: this is not deleted
        view.setUint8(offset, 32);
        offset++;
        field_meta.forEach(function(f) {
            var val = row[f.name];
            if (val === null || typeof val === 'undefined') val = '';

            switch (f.type) {
                // boolean
                case 'L':
                    view.setUint8(offset, val ? 84 : 70);
                    offset++;
                    break;

                // date
                case 'D': {
                    const date = new Date(val.toString());
                    val = lib.lpad(date.getFullYear().toString(), 4, '0') + 
                        lib.lpad((date.getMonth() + 1).toString(), 2, '0') + 
                        lib.lpad(date.getDate().toString(), 2, '0');
                    offset = lib.writeField(view, 8,
                        lib.lpad(val.toString(), 8, ' '), offset);
                    break;
                }

                // timestamp
                case '@': {
                    const date = new Date(val.toString());
                    const start = new Date(-4713, 0, 1);
                    const days = Math.floor(date - start / 86400000);
                    const time = date.getHours() * 3600000 + date.getMinutes() * 60000 + date.getMilliseconds();
                    view.setInt32(offset, days);
                    offset += 4;
                    view.setInt32(offset, time);
                    offset += 4;
                    break;
                }
                // number
                case 'N':
                    offset = lib.writeField(view, f.size,
                        lib.lpad(val.toString(), f.size, ' ').substr(0, 18),
                        offset);
                    break;

                // string
                case 'C':
                    offset = lib.writeField(view, f.size,
                        lib.rpad(val.toString(), f.size, ' '), offset);
                    break;

                default:
                    throw new Error('Unknown field type');
            }
        });
    });

    // EOF flag
    view.setUint8(offset, 0x1A);

    return view;
};
