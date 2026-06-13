// https://github.com/rdfjs/N3.js/
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

// use <script type="module" ...> to ensure page is loaded (instead of load event)

// todo: use rdf-dereference package or parse xml using dedicated package?

import "https://unpkg.com/n3/browser/n3.min.js";

const factory = N3.DataFactory;
const parser = new N3.Parser();
const store = new N3.Store();
const prefixes = {
    "fdp": url,
    "fdp-o": "https://w3id.org/fdp/fdp-o#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
};
const mediatypeTextTurtle = 'text/turtle';

// reasoning/inferencing
const rules = `
# infer subclass
{
  ?subject a ?object .
  ?object <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?otherObject .
} => {
  ?subject a ?otherObject .
} .
# infer subproperty
{
  ?subject ?predicate ?object .
  ?predicate <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> ?otherPredicate .
} => {
  ?subject ?otherPredicate ?object .
} .
`;
const rulesParser = new N3.Parser({ format: 'text/n3' });
const rulesStore = new N3.Store(rulesParser.parse(rules));
const reasoner = new N3.Reasoner(store);

// keep track of recursive promises so we can wait for them to be fulfilled
const recursiveParsePromises = [];

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
    },
    "https://w3id.org/fdp/fdp-o#": {
        "url": "fdp-o.ttl",
        "accept": undefined,
    },
};

function getLabel(iri, language="en") {
    // try to get a human readable label for an iri
    // default to prefix substitution
    let label = withPrefixes(iri);
    // try to get actual label for iri
    const labels = store.getObjects(iri, "http://www.w3.org/2000/01/rdf-schema#label");
    const languageTag = "@" + language;
    for (const labelCandidate of labels) {
        console.debug("found label candidate: %s", labelCandidate.id);
        if (labelCandidate.id.endsWith(languageTag) || !labelCandidate.id.includes("@")) {
            label = labelCandidate.id.replaceAll("\"", "").replaceAll(languageTag, "");
            console.debug("found label for %s: %s (language: %s)", iri, label, language);
            // break on first match
            break;
        }
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
    iriElement.title = withPrefixes(iri);
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

export async function populate(containerElement, url) {
    // get core rdf ontologies
    for (const key of ["fdp-o", "rdf", "rdfs"]) {
        await parseFromUrl(prefixes[key]);
    }

    // wait for all promises to be fulfilled
    if (recursiveParsePromises.length > 0) {
        console.info("awaiting %d promises", recursiveParsePromises.length);
        await Promise.all(recursiveParsePromises);
        console.info("promises fulfilled");
    }

    // populates the html page with rdf statements from the store
    console.debug("populate() called for url %s", url);
    console.debug(prefixes);
    store.forSubjects(subject => {
            containerElement.appendChild(createElementSubject(subject));
            console.info("subject populated: %s", subject.value);
        },
        null,
        null,
        // only include subjects from the root fdp graph
        factory.namedNode(url));

    // apply inference rules to the store (this adds statements)
    console.info("store size before reasoning: " + store.size);
    reasoner.reason(rulesStore);
    console.info("store size after reasoning: " + store.size);

    // TODO: why don't the following queries yield the same result?
    //  They should, due to inference, because fdp-o:metadataIssued is a
    //  subproperty of dcterms:date, right?
    console.log("get subjects:");
    console.log(store.getSubjects(
        factory.namedNode("https://w3id.org/fdp/fdp-o#metadataIssued"),
        null,
        factory.namedNode(url)));
    console.log(store.getSubjects(
        factory.namedNode("http://purl.org/dc/terms/date"),
        null,
        factory.namedNode(url)));

}

export async function parseFromUrl(url, maxDepth, depth) {
    // gets rdf-turtle text from url and parses it into the store
    // recursively parses prefix urls up to specified depth
    if (depth === undefined) {
        depth = 0;
    }
    const ttl = await getTurtle(url);
    if (ttl) {
        // parse the turtle content
        parser.parse(ttl, {
            onQuad: (error, quad) => {
                if (quad) {
                    // todo: can't we just modify the graph on the existing quad?
                    const newQuad = factory.quad(
                        quad.subject,
                        quad.predicate,
                        quad.object,
                        factory.namedNode(url));
                    store.add(newQuad);
                    console.debug("added to store: %s (graph: %s)", newQuad.subject.id, newQuad.graph.id);
                }
                if (error) {
                    console.warn("failed to parse quad for %s:\n%s", url, error);
                    console.debug(error);
                }
            },
            onPrefix: (prefix, iri) => {
                console.debug(prefix);
                prefixes[prefix] = iri.id;
                if (depth < maxDepth) {
                    console.debug("(depth %d) getting ttl for prefix: %s (%s)", depth, prefix, iri.id);
                    const recursiveParsePromise = parseFromUrl(iri.id, maxDepth, depth + 1);
                    recursiveParsePromises.push(recursiveParsePromise);
                } else {
                    console.debug("skipping prefix %s (depth %d)", prefix, depth);
                }
            },
        });
    } else {
        console.warn("failed to get turtle from %s", url);
    }
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
            console.debug('using accept header override: %s', options.headers.accept);
        }
    }

    // enforce https
    finalUrl = finalUrl.replace("http://", "https://");

    // generic fetch request with error handling
    try {
        console.debug("fetching %s from %s", options.headers.accept, finalUrl);
        const response = await fetch(finalUrl, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        console.debug("got success response from %s", url);
        return await response.text();
    } catch (error) {
        console.error(error);
    }
}