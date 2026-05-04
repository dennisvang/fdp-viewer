// https://github.com/rdfjs/N3.js/
// use <script type="module" ...> to ensure page is loaded (instead of load event)

const divStatements = document.querySelector('#statements');
const parser = new N3.Parser();
const url = document.querySelector("#url").value;
console.log(url);
const ttl = await getTurtle(url);
console.log(ttl);
const store = new N3.Store();
parseFromUrl(url, 1).then(populate);
const prefixes = {
    "fdp": url,
    "fdp-o": "https://w3id.org/fdp/fdp-o#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
};

function createLabelForIRI(iri) {
    // creates a simplified label for the iri
    // todo: use actual label from rdf class/property definition
    let label = `<${iri}>`;
    for (const [prefix, prefixIRI] of Object.entries(prefixes)) {
        if (iri.includes(prefixIRI)) {
            label = iri.replace(prefixIRI, prefix + ":");
        }
    }
    return label;
}

function createElementTerm(term) {
    // creates an html element to represent an rdf term
    console.log(term.termType);
    let termElement;
    console.log(term.id.toString());
    if (term.termType === "Literal") {
        termElement = document.createElement("span");
        termElement.textContent = term.id;
    } else {
        termElement = document.createElement("a");
        termElement.href = term.id;
        termElement.textContent = createLabelForIRI(term.id);
    }
    return termElement;
}

function createElementStatement(quad) {
    let statement = document.createElement("div");
    statement.classList.add("statement");
    for (const termName of ["subject", "predicate", "object"]) {
        const element = createElementTerm(quad[termName]);
        element.classList.add(termName);
        statement.appendChild(element);
        statement.appendChild(document.createTextNode(", "));
    }
    return statement;
}

async function populate() {
    // populates the html page with rdf statements from the store
    console.log("populate() called");
    console.log(prefixes);
    for (const quad of store) {
        console.log(quad);
        divStatements.appendChild(createElementStatement(quad));
    }
}

async function parseFromUrl(url, maxDepth, depth) {
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
            }
        },
        onPrefix: (prefix, iri) => {
            console.log(prefix);
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