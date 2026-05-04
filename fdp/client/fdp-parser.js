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

function createTermElement(term) {
    // creates an html element to represent an rdf term
    // todo: use actual rdf label
    console.log(term.termType);
    let label;
    const termId = term.id.replace(url, "fdp");
    console.log(term.id.toString());
    if (term.termType === "Literal") {
        label = document.createElement("span");
        label.textContent = termId;
    } else {
        label = document.createElement("a");
        label.href = term.id;
        label.textContent = `<${termId}>`;
    }
    return label;
}

function createElementStatement(quad) {
    let statement = document.createElement("div");
    statement.classList.add("statement");
    for (const termName of ["subject", "predicate", "object"]) {
        const element = createTermElement(quad[termName]);
        element.classList.add(termName);
        statement.appendChild(element);
        statement.appendChild(document.createTextNode(","));
    }
    return statement;
}

async function populate() {
    // populates the html page with rdf statements from the store
    console.log("populate() called");
    for (const quad of store) {
        console.log(quad);
        divStatements.appendChild(createElementStatement(quad));
    }
}

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