// https://github.com/rdfjs/N3.js/
// use <script type="module" ...> to ensure page is loaded (instead of load event)

import "https://unpkg.com/n3/browser/n3.min.js";

const namedNode = N3.DataFactory.namedNode;
const parser = new N3.Parser();
const store = new N3.Store();
const prefixes = {
    "fdp": url,
    "fdp-o": "https://w3id.org/fdp/fdp-o#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
};
const mediatypeTextTurtle = 'text/turtle';


// workaround for CORS restrictions on purl resources
// (redirects and CORS prevent download via purl, so we use the actual url instead)
const corsMap = {
    "http://purl.org/dc/terms/": {
        "url": "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
        "accept": undefined,
    },
    "http://www.w3.org/2001/XMLSchema#": {
        "url": undefined,
        "accept": "application/xml",
    }
};

function getLabel(iri) {
    // try to get a human readable label for an iri
    // default to prefix substitution
    let label = withPrefixes(iri);
    // try to get actual label for iri
    const objects = store.getObjects(iri, "http://www.w3.org/2000/01/rdf-schema#label");
    if (objects.length) {
        // todo: handle multiple labels...
        label = objects[0].id;
    }
    // if all else fails, fall back on iri representation
    if (label === iri) {
        label = `<${iri}>`;
    }
    return label;
}

function withPrefixes(value) {
    // replaces iris with corresponding prefixes
    for (const [prefix, prefixIRI] of Object.entries(prefixes)) {
        value = value.replace(prefixIRI, prefix + ":");
    }
    return value;
}

function createElementTitle(iri) {
    // creates an html element for fancy clickable title
    const titleElement = document.createElement("div");
    titleElement.classList.add("title");
    titleElement.appendChild(createElementIRI(iri, "subject-title"));
    return titleElement;
}

function createElementIRI(iri, ...classes) {
    // creates a clickable html element for iri, with simplified label
    const iriElement = document.createElement("a");
    iriElement.href = iri;
    iriElement.target = "_blank";
    iriElement.textContent = getLabel(iri);
    if (classes && classes.length) {
        iriElement.classList.add(classes);
    }
    return iriElement;
}

function createElementTerm(term) {
    // creates an html element to represent an rdf term
    let termElement;
    if (term.termType === "Literal") {
        termElement = document.createElement("span");
        termElement.textContent = withPrefixes(term.id);
    } else {
        termElement = createElementIRI(term.id);
    }
    termElement.classList.add("rdf-term");
    return termElement;
}

function createElementStatement(quad) {
    // creates an html element containing a single rdf statement
    // consisting of rdf terms <subject> <predicate> <object>
    let statementElement = document.createElement("div");
    statementElement.classList.add("rdf-statement");
    for (const termName of ["subject", "predicate", "object"]) {
        const element = createElementTerm(quad[termName]);
        element.classList.add("rdf-" + termName);
        statementElement.appendChild(element);
    }
    return statementElement;
}

function createElementSubject(subject) {
    // creates an html element containing all rdf statements for the given rdf subject
    console.debug(`createElementSubject() called for ${subject.id}`);
    const subjectElement = document.createElement("div");
    subjectElement.classList.add("subject");
    subjectElement.id = subject.id;
    subjectElement.appendChild(createElementTitle(subject.id));
    for (const quad of store.match(subject)) {
        console.debug(quad);
        subjectElement.appendChild(createElementStatement(quad));
    }
    return subjectElement;
}

export async function populate(containerElement) {
    // populates the html page with rdf statements from the store
    console.debug("populate() called");
    console.debug(prefixes);
    store.forSubjects(subject => {
        containerElement.appendChild(createElementSubject(subject));
        console.log(subject);
    });

    // TODO: why are ontologies not added to the store? the following queries should
    //  yield the same result due to inference, because fdp-o:metadataIssued is a
    //  subproperty of dcterms:date
    console.log("get subjects:");
    console.log(store.getSubjects(namedNode("https://w3id.org/fdp/fdp-o#metadataIssued"), null, null));
    console.log(store.getSubjects(namedNode("http://purl.org/dc/terms/date"), null, null));

}

export async function parseFromUrl(url, maxDepth, depth) {
    // gets rdf-turtle text from url and parses it into the store
    // recursively parses prefix urls up to specified depth
    if (depth === undefined) {
        depth = 0;
    }
    const ttl = await getTurtle(url);
    parser.parse(ttl, {
        onQuad: (err, quad) => {
            if (quad !== null) {
                store.add(quad);
                // console.debug("added to store: " + quad.subject.id)
            }
        },
        onPrefix: (prefix, iri) => {
            console.debug(prefix);
            prefixes[prefix] = iri.id;
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
    // get rdf-turtle content from url
    const requestOptions = {
        method: 'GET',
        headers: {'accept': mediatypeTextTurtle},
    };
    return await makeRequest(url, requestOptions);
}

async function makeRequest(url, options) {
    // workaround for CORS/redirect issues with some peristent urls
    // (see https://github.com/fdp-specs/fdp-specs.github.io/issues/35 for details)
    let finalUrl = url;
    if (url in corsMap) {
        finalUrl = corsMap[url].url ? corsMap[url].url : url;
        console.warn(`using cors workaround for ${url} (${finalUrl})`);
        if (corsMap[url].accept) {
            options.headers.accept = corsMap[url].accept;
            console.debug('using accept header override: ' + options.headers.accept);
        }
    }

    // enforce https
    finalUrl = finalUrl.replace("http://", "https://");

    // generic fetch request with error handling
    try {
        console.debug("fetching " + options.headers.accept + " from " + finalUrl);
        const response = await fetch(finalUrl, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        console.debug("got success response from " + url);
        return await response.text();
    } catch (error) {
        console.error(error);
    }
}