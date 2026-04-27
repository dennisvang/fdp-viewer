// https://github.com/rdfjs/N3.js/
// use <script type="module" ...> to ensure page is loaded (instead of load event)

const parser = new N3.Parser();
const url = document.querySelector("#url").value;
console.log(url);
const ttl = await getTurtle(url);
console.log(ttl);
const store = new N3.Store();
parseFromUrl(url, 1).then();

async function parseFromUrl(url, maxDepth, depth) {
    if (depth === undefined) {
        depth = 0;
    }
    const ttl = await getTurtle(url);
    parser.parse(ttl, {
        onQuad: (err, quad) => {
            if (quad !== null) {
                store.add(quad);
            }
        },
        onPrefix: (prefix, iri) => {
            if (depth < maxDepth) {
                console.log(`(depth ${depth}) getting ttl for prefix: ${prefix} (${iri.id})`);
                parseFromUrl(iri.id, maxDepth, depth + 1);
            } else {
                console.log(`skipping prefix ${prefix} (depth ${depth})`);
            }
        },
    });
}

async function getTurtle(url) {
    // get ttl from url
    const requestOptions = {
        method: 'GET',
        headers: {'Accept': 'text/turtle'},
    };
    return await makeRequest(url, requestOptions);
}

async function makeRequest(url, options) {
    // generic fetch request with error handling
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.log(error);
    }
}