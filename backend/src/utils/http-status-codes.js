/**
 * Complete HTTP Status Codes Reference (MDN-based)
 * Comprehensive status code definitions with categorization
 */

// 1xx Informational Responses
export const HTTP_STATUS_CODES = {
    // 1xx: Informational
    '100': { name: 'Continue', category: 'INFORMATIONAL', description: 'The server has received the request headers and the client should proceed to send the request body.' },
    '101': { name: 'Switching Protocols', category: 'INFORMATIONAL', description: 'The requester has asked the server to switch protocols and the server has agreed to do so.' },
    '102': { name: 'Processing', category: 'INFORMATIONAL', description: 'This code indicates that the server has received and is processing the request, but no response is available yet.' },
    '103': { name: 'Early Hints', category: 'INFORMATIONAL', description: 'Used to return some response headers before final HTTP message.' },

    // 2xx: Success
    '200': { name: 'OK', category: 'SUCCESS', description: 'The request succeeded. The meaning of success depends on the HTTP method.' },
    '201': { name: 'Created', category: 'SUCCESS', description: 'The request succeeded and a new resource was created as a result.' },
    '202': { name: 'Accepted', category: 'SUCCESS', description: 'The request has been accepted for processing, but the processing has not been completed.' },
    '203': { name: 'Non-Authoritative Information', category: 'SUCCESS', description: 'The server is a transforming proxy that received a 200 OK from its origin, but is returning a modified version of the origin\'s response.' },
    '204': { name: 'No Content', category: 'SUCCESS', description: 'The server successfully processed the request and is not returning any content.' },
    '205': { name: 'Reset Content', category: 'SUCCESS', description: 'The server tells the user agent to reset the document which sent this request.' },
    '206': { name: 'Partial Content', category: 'SUCCESS', description: 'The server is delivering only part of the resource due to a range header sent by the client.' },
    '207': { name: 'Multi-Status', category: 'SUCCESS', description: 'Conveys information about multiple resources, for situations where multiple status codes might be appropriate.' },
    '208': { name: 'Already Reported', category: 'SUCCESS', description: 'Used inside a DAV: propstat response element to avoid enumerating the internal members of a binding repeatedly.' },
    '226': { name: 'IM Used', category: 'SUCCESS', description: 'The server has fulfilled a GET request for the resource, and the response is a representation of the result of one or more instance-manipulations applied to the current instance.' },

    // 3xx: Redirection
    '300': { name: 'Multiple Choices', category: 'REDIRECT', description: 'Indicates that the request has more than one possible response. The user-agent or user should choose one of them.' },
    '301': { name: 'Moved Permanently', category: 'REDIRECT', description: 'This and all future requests should be directed to the given URI.' },
    '302': { name: 'Found', category: 'REDIRECT', description: 'Tells the client to perform a temporary redirect to a new URL.' },
    '303': { name: 'See Other', category: 'REDIRECT', description: 'The response to the request can be found under another URI using a GET method.' },
    '304': { name: 'Not Modified', category: 'REDIRECT', description: 'Indicates that the resource has not been modified since the version specified by the request headers.' },
    '307': { name: 'Temporary Redirect', category: 'REDIRECT', description: 'In this case, the request should be repeated with another URI; however, future requests should still use the original URI.' },
    '308': { name: 'Permanent Redirect', category: 'REDIRECT', description: 'The resource has been moved permanently to the location specified by the Location headers.' },

    // 4xx: Client Error
    '400': { name: 'Bad Request', category: 'CLIENT_ERROR', description: 'The server cannot process the request due to a client error.' },
    '401': { name: 'Unauthorized', category: 'CLIENT_ERROR', description: 'Although the HTTP standard specifies "unauthorized", semantically this response means "unauthenticated".' },
    '402': { name: 'Payment Required', category: 'CLIENT_ERROR', description: 'Reserved for future use. The original intention was that this code might be used as part of some form of digital cash or micropayment scheme.' },
    '403': { name: 'Forbidden', category: 'CLIENT_ERROR', description: 'The client does not have access rights to the content.' },
    '404': { name: 'Not Found', category: 'CLIENT_ERROR', description: 'The server cannot find the requested resource.' },
    '405': { name: 'Method Not Allowed', category: 'CLIENT_ERROR', description: 'The method is known by the server but is not supported by the target resource.' },
    '406': { name: 'Not Acceptable', category: 'CLIENT_ERROR', description: 'The server cannot produce a response matching the list of acceptable values defined in the request headers.' },
    '407': { name: 'Proxy Authentication Required', category: 'CLIENT_ERROR', description: 'Similar to 401 Unauthorized but authentication is needed to be done by a proxy.' },
    '408': { name: 'Request Timeout', category: 'CLIENT_ERROR', description: 'This response is sent on an idle connection by some servers, even without any previous request by the client.' },
    '409': { name: 'Conflict', category: 'CLIENT_ERROR', description: 'This response is sent when a request conflicts with the current state of the server.' },
    '410': { name: 'Gone', category: 'CLIENT_ERROR', description: 'Indicates that the requested resource is no longer available at the server and no forwarding address is known.' },
    '411': { name: 'Length Required', category: 'CLIENT_ERROR', description: 'The server refuses to accept the request without a defined Content-Length header.' },
    '412': { name: 'Precondition Failed', category: 'CLIENT_ERROR', description: 'Indicates that one or more conditions given in the request header fields evaluated to false.' },
    '413': { name: 'Content Too Large', category: 'CLIENT_ERROR', description: 'The request entity is larger than limits defined by server.' },
    '414': { name: 'URI Too Long', category: 'CLIENT_ERROR', description: 'The URI requested by the client is longer than the server is willing to interpret.' },
    '415': { name: 'Unsupported Media Type', category: 'CLIENT_ERROR', description: 'The media format of the requested data is not supported by the server.' },
    '416': { name: 'Range Not Satisfiable', category: 'CLIENT_ERROR', description: 'The range specified by the Range header field in the request cannot be fulfilled.' },
    '417': { name: 'Expectation Failed', category: 'CLIENT_ERROR', description: 'The expectation indicated by the Expect request header field could not be met by this server.' },
    '418': { name: 'I\'m a teapot', category: 'CLIENT_ERROR', description: 'Defined in 1998 as one of the traditional IETF April Fools\' jokes, in RFC 2324, Hyper Text Coffee Pot Control Protocol.' },
    '421': { name: 'Misdirected Request', category: 'CLIENT_ERROR', description: 'The request was directed at a server that is not able to produce a response.' },
    '422': { name: 'Unprocessable Content', category: 'CLIENT_ERROR', description: 'The request was well-formed but was unable to be followed due to semantic errors.' },
    '423': { name: 'Locked', category: 'CLIENT_ERROR', description: 'The resource that is being accessed is locked.' },
    '424': { name: 'Failed Dependency', category: 'CLIENT_ERROR', description: 'The request failed due to failure of a previous request.' },
    '425': { name: 'Too Early', category: 'CLIENT_ERROR', description: 'Indicates that the server is unwilling to risk processing a request that might be replayed.' },
    '426': { name: 'Upgrade Required', category: 'CLIENT_ERROR', description: 'The server refuses to perform the request using the current protocol but might be willing to do so after the client upgrades to a different protocol.' },
    '428': { name: 'Precondition Required', category: 'CLIENT_ERROR', description: 'The origin server requires the request to be conditional.' },
    '429': { name: 'Too Many Requests', category: 'CLIENT_ERROR', description: 'The user has sent too many requests in a given amount of time ("rate limiting").' },
    '431': { name: 'Request Header Fields Too Large', category: 'CLIENT_ERROR', description: 'The server is unwilling to process the request because its header fields are too large.' },
    '451': { name: 'Unavailable For Legal Reasons', category: 'CLIENT_ERROR', description: 'The user agent requested a resource that cannot be legally provided.' },

    // 5xx: Server Error
    '500': { name: 'Internal Server Error', category: 'SERVER_ERROR', description: 'The server has encountered a situation it doesn\'t know how to handle.' },
    '501': { name: 'Not Implemented', category: 'SERVER_ERROR', description: 'The request method is not supported by the server and cannot be handled.' },
    '502': { name: 'Bad Gateway', category: 'SERVER_ERROR', description: 'This error response means that the server, while working as a gateway to get a response needed to handle the request, got an invalid response.' },
    '503': { name: 'Service Unavailable', category: 'SERVER_ERROR', description: 'The server is not ready to handle the request.' },
    '504': { name: 'Gateway Timeout', category: 'SERVER_ERROR', description: 'This error response is given when the server is acting as a gateway and cannot get a response in time.' },
    '505': { name: 'HTTP Version Not Supported', category: 'SERVER_ERROR', description: 'The HTTP version used in the request is not supported by the server.' },
    '506': { name: 'Variant Also Negotiates', category: 'SERVER_ERROR', description: 'Transparent content negotiation for the request results in a circular reference.' },
    '507': { name: 'Insufficient Storage', category: 'SERVER_ERROR', description: 'The server is unable to store the representation needed to complete the request.' },
    '508': { name: 'Loop Detected', category: 'SERVER_ERROR', description: 'The server detected an infinite loop while processing the request.' },
    '510': { name: 'Not Extended', category: 'SERVER_ERROR', description: 'Further extensions to the request are required for the server to fulfill it.' },
    '511': { name: 'Network Authentication Required', category: 'SERVER_ERROR', description: 'Indicates that the client needs to authenticate to gain network access.' }
};

// Helper functions
export function getStatusCodeCategory(statusCode) {
    if (statusCode == null) return 'UNKNOWN';
    const code = statusCode.toString();
    if (HTTP_STATUS_CODES[code]) {
        return HTTP_STATUS_CODES[code].category;
    }
    return 'UNKNOWN';
}

export function getStatusCodeName(statusCode) {
    if (statusCode == null) return 'Unknown Status Code';
    const code = statusCode.toString();
    if (HTTP_STATUS_CODES[code]) {
        return HTTP_STATUS_CODES[code].name;
    }
    return 'Unknown Status Code';
}

export function getStatusCodeDescription(statusCode) {
    if (statusCode == null) return 'No description available';
    const code = statusCode.toString();
    if (HTTP_STATUS_CODES[code]) {
        return HTTP_STATUS_CODES[code].description;
    }
    return 'No description available';
}

export function getAllStatusCodesByCategory() {
    return {
        'INFORMATIONAL': Object.entries(HTTP_STATUS_CODES)
            .filter(([_, info]) => info.category === 'INFORMATIONAL')
            .map(([code, info]) => ({ code: parseInt(code), ...info })),
        'SUCCESS': Object.entries(HTTP_STATUS_CODES)
            .filter(([_, info]) => info.category === 'SUCCESS')
            .map(([code, info]) => ({ code: parseInt(code), ...info })),
        'REDIRECT': Object.entries(HTTP_STATUS_CODES)
            .filter(([_, info]) => info.category === 'REDIRECT')
            .map(([code, info]) => ({ code: parseInt(code), ...info })),
        'CLIENT_ERROR': Object.entries(HTTP_STATUS_CODES)
            .filter(([_, info]) => info.category === 'CLIENT_ERROR')
            .map(([code, info]) => ({ code: parseInt(code), ...info })),
        'SERVER_ERROR': Object.entries(HTTP_STATUS_CODES)
            .filter(([_, info]) => info.category === 'SERVER_ERROR')
            .map(([code, info]) => ({ code: parseInt(code), ...info }))
    };
}

export function shouldTreatAsUp(statusCode, monitor = {}) {
    if (statusCode == null) return false;
    const code = parseInt(statusCode);
    if (isNaN(code)) return false;
    const category = getStatusCodeCategory(code);


    // Standard success categories
    // Note: INFORMATIONAL (1xx) codes are now treated as DOWN since they indicate
    // the server hasn't completed the request yet
    return category === 'SUCCESS' || category === 'REDIRECT';
}

export function shouldTreatAsDown(statusCode, monitor = {}) {
    if (statusCode == null) return true;
    const code = parseInt(statusCode);
    if (isNaN(code)) return true;
    const category = getStatusCodeCategory(code);


    // Server errors and client errors indicate down status
    // Note: INFORMATIONAL (1xx) codes are now treated as DEGRADED (not DOWN)
    // since they indicate the server is processing but not complete
    return category === 'SERVER_ERROR' ||
        category === 'CLIENT_ERROR' ||
        (code >= 500 && code < 600);
}

export function shouldTreatAsDegraded(statusCode, monitor = {}) {
    if (statusCode == null) return false;
    const code = parseInt(statusCode);
    if (isNaN(code)) return false;
    const category = getStatusCodeCategory(code);


    // INFORMATIONAL (1xx) codes indicate server is processing but not complete - treat as DEGRADED
    if (category === 'INFORMATIONAL') return true;

    // 4xx errors are treated as DOWN (not DEGRADED) by shouldTreatAsDown()
    // Only 1xx responses are DEGRADED in status code classification
    // Performance-based degradation is handled separately by the health evaluator
    return false;
}

export default HTTP_STATUS_CODES;
