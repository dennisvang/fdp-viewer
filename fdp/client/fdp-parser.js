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

function withPrefixes(value) {
    // replaces iris with corresponding prefixes
    for (const [prefix, prefixIRI] of Object.entries(prefixes)) {
        value = value.replace(prefixIRI, prefix + ":");
    }
    return value;
}

function createLabelForIRI(iri) {
    // creates a simplified label for the iri
    // todo: use actual label from rdf class/property definition
    let label = withPrefixes(iri);
    if (label === iri) {
        label = `<${iri}>`;
    }
    return label;
}

function createElementText(text, ...classes) {
    // creates an html span element for simple text display
    // any additional arguments are interpreted as css classes
    const textElement = document.createElement("span");
    textElement.textContent = text;
    if (classes && classes.length) {
        textElement.classList.add(classes);
    }
    return textElement;
}

function createElementTerm(term) {
    // creates an html element to represent an rdf term
    console.log(term.termType);
    let termElement;
    console.log(term.id.toString());
    if (term.termType === "Literal") {
        termElement = document.createElement("span");
        termElement.textContent = withPrefixes(term.id);
    } else {
        termElement = document.createElement("a");
        termElement.href = term.id;
        termElement.target = "_blank";
        termElement.textContent = createLabelForIRI(term.id);
    }
    return termElement;
}

function createElementStatement(quad) {
    // creates an html element containing a single rdf statement
    // consisting of rdf terms <subject> <predicate> <object>
    let statement = document.createElement("div");
    statement.classList.add("rdf-statement");
    for (const termName of ["subject", "predicate", "object"]) {
        const element = createElementTerm(quad[termName]);
        element.classList.add("rdf-" + termName);
        statement.appendChild(element);
    }
    return statement;
}

function createElementSubject(subject) {
    // creates an html element containing all rdf statements for the given rdf subject
    console.log(`createElementSubject() called for ${subject.id}`);
    const subjectElement = document.createElement("div");
    subjectElement.classList.add("subject");
    for (const quad of store.match(subject)) {
        console.log(quad);
        subjectElement.appendChild(createElementStatement(quad));
    }
    divStatements.appendChild(subjectElement);
}

async function populate() {
    // populates the html page with rdf statements from the store
    console.log("populate() called");
    console.log(prefixes);
    store.forSubjects(createElementSubject);
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