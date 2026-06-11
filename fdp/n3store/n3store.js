// https://github.com/rdfjs/N3.js/
// use <script type="module" ...> to ensure page is loaded (instead of load event)

import "https://unpkg.com/n3/browser/n3.min.js";

const parser = new N3.Parser();
const store = new N3.Store();
const prefixes = [
    "https://w3id.org/fdp/fdp-o#",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "http://www.w3.org/2000/01/rdf-schema#",
    "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
];

export async function populate(container) {
    // populates the html page with rdf statements from the store
    console.info("populate() called");

    // parse prefix urls in a synchronous manner
    for (const url of prefixes) {
        await parseFromUrl(url);
    }

    // show results
    console.info("store size: " + store.size);
    for (const quad of store) {
        console.info("store contains " + quad);
        const div = document.createElement("div");
        div.textContent = quad.subject.id;
        container.appendChild(div);
    }
}

async function parseFromUrl(url) {
    // gets rdf-turtle text from url and parses it into the store

    const ttl = await makeRequest(url);
    parser.parse(ttl, {
        onQuad: (err, quad) => {
            try {
                if (quad !== null) {
                    store.add(quad);
                    console.debug("added to store: " + quad.subject.id)
                }
            } catch (error) {
                console.warn("parser failed for " + url);
                console.warn(error);
            }
        },
        onPrefix: (prefix, iri) => {
            console.debug("found prefix: " + prefix);
        },
    });
}

async function makeRequest(url, accept) {
    const options = {
        method: "GET",
        headers: {"accept": accept ? accept : "text/turtle"},
    };

    // enforce https
    url = url.replace("http://", "https://");

    // generic fetch request with error handling
    try {
        console.info("fetching " + url);
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        console.info("got success response from " + url);
        return await response.text();
    } catch (error) {
        console.error(error);
    }
}