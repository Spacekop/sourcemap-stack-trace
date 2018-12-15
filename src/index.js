const fetch = require('node-fetch');
const SourceMapConsumer = require('source-map').SourceMapConsumer;

const cache = {};

const resolveMap = sourceFileUrl => cache[sourceFileUrl] || fetch(sourceFileUrl)
    .then(response => response.text())
    .then(text => /\r?\n\/\/# sourceMappingURL=(.*)$/.exec(text)[1])
    .then(sourceFile => sourceFileUrl.replace(/[^\/]+$/, sourceFile))
    .then(fetch)
    .then(response => response.text())
    .then(body => {
        const response = {
            sourceFileUrl,
            body
        };
        cache[sourceFileUrl] = response;
        return response;
    });

const parseStackTrace = requestBody => {
    const stackTraceLines = requestBody.split(/\r?\n/);
    const traceLinesBySourceFile = {};

    for (let i = 1; i < stackTraceLines.length; i++) {
        const regex = new RegExp('at (.+) \\((https?://[^:]+):([0-9]+):([0-9]+)\\)');
        const match = regex.exec(stackTraceLines[i]);
        if (match == null) {
            continue;
        }

        const sourceFileUrl = match[2];

        const lineInfo = {
            name: match[1],
            line: parseInt(match[3]),
            column: parseInt(match[4]),
            stackOrder: i - 1
        };

        if (!traceLinesBySourceFile[sourceFileUrl]) {
            traceLinesBySourceFile[sourceFileUrl] = {
                stackLines: [],
                sourceMapPromise: resolveMap(sourceFileUrl)
            };
        }

        traceLinesBySourceFile[sourceFileUrl].stackLines.push(lineInfo);
    }

    return {
        message: stackTraceLines[0],
        traceLinesBySourceFile
    }
};

const parseOriginalPositions = parsedStackTrace => {
    const sourceMapPromises = Object.values(parsedStackTrace.traceLinesBySourceFile)
        .map(lines => lines.sourceMapPromise);

    const flatten = array => array.reduce((acc, val) => acc.concat(val), []);

    return Promise.all(sourceMapPromises)
        .then(sourceMaps => sourceMaps.map(sourceMap => SourceMapConsumer.with(sourceMap.body, null, consumer =>
            parsedStackTrace.traceLinesBySourceFile[sourceMap.sourceFileUrl].stackLines.map(line => 
                Object.assign({}, line, {
                    originalPosition: consumer.originalPositionFor(line)
                }))
        )))
        .then(output => Promise.all(output))
        .then(output => flatten(output))
        .then(lineInfos => lineInfos.reduce((acc, lineInfo) => {
            acc[lineInfo.stackOrder] = Object.assign({}, lineInfo.originalPosition, {
                generatedName: lineInfo.name
            });
            return acc;
        }, []));
}

const toApiGatewayResponse = (object, code) => ({
    isBase64Encoded: false,
    statusCode: code,
    headers: {},
    body: JSON.stringify(object) 
});

exports.handler = (event, context, callback) => {
    const apiGatewayCallback = (error, success) => {
        if (error !== null) { 
            callback(toApiGatewayResponse(error, 500));
            return;
        }

        callback(null, toApiGatewayResponse(success, 200));
    };

    try {
        const { stackTrace } = JSON.parse(event.body);
    
        const parsedStackTrace = parseStackTrace(stackTrace);
    
        parseOriginalPositions(parsedStackTrace)
            .then(result => apiGatewayCallback(null, {
                message: parsedStackTrace.message,
                stackTrace: result
            }));
    } catch (exception) {
        apiGatewayCallback(exception, null);
    }
};

/*
const body = {
    "stackTrace": "TypeError: Cannot set property 'lastIndex' of undefined\nat r (https://staging.cvent-assets.com/event-guestside-site/assets/41.prod._v4.bdb4b078d70fcbbe35ee819a656d0f44.js:1:254385)\nat t.render (https://staging.cvent-assets.com/event-guestside-site/assets/56.prod._v4.17a5c6994fa1f90b1f9e009b5c3d2409.js:1:1732)\nat c._renderValidatedComponentWithoutOwnerOrContext (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:245414)\nat c._renderValidatedComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:245541)\nat c.performInitialMount (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:241382)\nat c.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:240428)\nat Object.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:294148)\nat c.performInitialMount (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:241542)\nat c.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:240428)\nat Object.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:294148)"
};

exports.handler({ body: JSON.stringify(body) }, null, (error, success) => console.log(success));
*/

// console.log('TypeError: Cannot set property \'lastIndex\' of undefined\nat r (https://staging.cvent-assets.com/event-guestside-site/assets/41.prod._v4.bdb4b078d70fcbbe35ee819a656d0f44.js:1:254385)\nat t.render (https://staging.cvent-assets.com/event-guestside-site/assets/56.prod._v4.17a5c6994fa1f90b1f9e009b5c3d2409.js:1:1732)\nat c._renderValidatedComponentWithoutOwnerOrContext (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:245414)\nat c._renderValidatedComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:245541)\nat c.performInitialMount (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:241382)\nat c.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:240428)\nat Object.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:294148)\nat c.performInitialMount (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:241542)\nat c.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:240428)\nat Object.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:294148)');

// "{\"stackTrace\":\"TypeError: Cannot set property 'lastIndex' of undefined\\nat r (https://staging.cvent-assets.com/event-guestside-site/assets/41.prod._v4.bdb4b078d70fcbbe35ee819a656d0f44.js:1:254385)\\nat t.render (https://staging.cvent-assets.com/event-guestside-site/assets/56.prod._v4.17a5c6994fa1f90b1f9e009b5c3d2409.js:1:1732)\\nat c._renderValidatedComponentWithoutOwnerOrContext (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:245414)\\nat c._renderValidatedComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:245541)\\nat c.performInitialMount (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:241382)\\nat c.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:240428)\\nat Object.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:294148)\\nat c.performInitialMount (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:241542)\\nat c.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:240428)\\nat Object.mountComponent (https://staging.cvent-assets.com/event-guestside-site/assets/vendor.prod._v4.ad6bc0015df2196c861395be5776ba0a.js:1:294148)\"}"