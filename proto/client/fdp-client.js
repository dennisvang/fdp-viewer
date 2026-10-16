// https://github.com/rdfjs/N3.js/ (repo)
// https://rdf.js.org/N3.js/ (docs)
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

// use <script type="module" ...> to ensure page is loaded (instead of load event)

// todo: use rdf-dereference package or parse xml using dedicated package?

import { DataFactory, Parser, Reasoner, Store } from "https://unpkg.com/n3/browser/n3.esm.min.js";

const mediatypeTextTurtle = "text/turtle";
const mediatypeTextN3 = "text/n3";
const prefixes = {
    "fdp": undefined,
    "fdp-o": "https://w3id.org/fdp/fdp-o#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
};

// inference rules
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

# infer close match property (to handle fdp-o:metadataCatalog...)
{
  ?subject ?predicate ?object .
  ?predicate <http://www.w3.org/2004/02/skos/core#closeMatch> ?otherPredicate .
} => {
  ?subject ?otherPredicate ?object .
} .
`;

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

// main triple store
const parser = new Parser({ format: mediatypeTextTurtle });
const store = new Store();

/**
 * applies reasoning to infer relations, etc.
 *
 * Note that n3.js does not support reasoning over multiple graphs, so we need to copy
 * all quads from individual graphs into the default graph of a single new triple store
 * and reason over that. The resulting triples are then copied back into the specified
 * root graph in the main triple store.
 */
function reason(rootGraphUri) {
    // initialize reasoning components
    const rulesParser = new Parser({ format: mediatypeTextN3 });
    const rulesStore = new Store(rulesParser.parse(rules));
    const unionStore = new Store();
    const reasoner = new Reasoner(unionStore);

    // copy quads from all graphs into the default graph of the union store
    store.forEach(quad => {
        unionStore.addQuad(
            quad.subject, quad.predicate, quad.object, DataFactory.defaultGraph()
        );
    });

    // apply reasoning based on the specified inference rules
    console.info("union-store size before reasoning: " + unionStore.size);
    reasoner.reason(rulesStore);
    console.info("union-store size after reasoning: " + unionStore.size);

    // copy the relevant quads back into the specified graph in the main triple store
    // todo: improve efficiency if necessary
    const rootGraph = DataFactory.namedNode(rootGraphUri);
    const rootGraphSubjectIds = store.getSubjects(null, null, rootGraph).map(s => s.id);
    console.info("store size before copying inferred quads: " + store.size)
    unionStore.forEach(quad => {
        if (rootGraphSubjectIds.includes(quad.subject.id)) {
            if (store.addQuad(quad.subject, quad.predicate, quad.object, rootGraph)) {
                console.debug(
                    "inferred statement: %s, %s, %s",
                    quad.subject.id, quad.predicate.id, quad.object.id
                );
            }
        }
    });
    console.info("store size after copying inferred quads: " + store.size)
}

/** updates all fdp content in the container */
export function updateFdp(fdpUrl, container) {
    // reset container and triple store
    clearFdp(container);
    // update fdp prefix because that is used by the populate method
    prefixes.fdp = fdpUrl;
    // parse fdp and populate
    parseFromUrl(prefixes.fdp, 1).then(() => populate(container));
    // intercept anchor clicks (duplicate listeners are ignored)
    container.addEventListener("click", handleAnchorClicks);
}

/** removes all triples from the store and clears the container */
function clearFdp(container) {
    // remove all triples from the store
    store.removeMatches(null, null, null, null);
    // remove all html elements from the container
    container.innerHTML = "";
}

/**
 * uses event delegation to intercept all anchor clicks and decide between internal
 * and external navigation.
 * todo: use the navigation API
 *  https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
 */
function handleAnchorClicks(event) {
    if (event.target.nodeName === "A" && event.target.href.startsWith(prefixes.fdp)) {
        if (event.target.href.includes("#")) {
            // cancel external navigation
            event.preventDefault();
        }
        // todo: infer all child and parent uris (inferRelatedResources) based on
        //  dcterms hasPart and isPartOf, then check if the target href matches one of
        //  those uris and re-populate the container with that resource
    }
}

/** ... */
function getRelatedResources() {
    const fdpUrl = prefixes.fdp;
    const children = store.getObjects(
        DataFactory.namedNode(fdpUrl),
        DataFactory.namedNode("http://purl.org/dc/terms/hasPart"),
        null);
    const parents = store.getObjects(
        DataFactory.namedNode(fdpUrl),
        DataFactory.namedNode("http://purl.org/dc/terms/isPartOf"),
        null);
    return { children, parents };
}

/** tries to get a human readable label for an iri */
function getLabel(iri, language="en") {
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

/** replaces iris with corresponding prefixes */
function withPrefixes(value) {
    for (const [prefix, prefixIRI] of Object.entries(prefixes)) {
        value = value.replace(prefixIRI, prefix + ":");
    }
    return value;
}

/** creates an html element for fancy clickable title */
function createElementTitle(iri) {
    const titleElement = document.createElement("div");
    titleElement.classList.add("title");
    titleElement.appendChild(createElementIRI(iri, "subject-title"));
    return titleElement;
}

/** creates a clickable html element for iri, with simplified label */
function createElementIRI(iri, ...classes) {
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

/** creates an html element to represent an rdf term */
function createElementTerm(term) {
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

/**
 * creates an html element containing a single rdf statement consisting of rdf terms
 * <subject> <predicate> <object>
 */
function createElementStatement(quad) {
    let statementElement = document.createElement("div");
    statementElement.classList.add("rdf-statement");
    for (const termName of ["subject", "predicate", "object"]) {
        const element = createElementTerm(quad[termName]);
        element.classList.add("rdf-" + termName);
        statementElement.appendChild(element);
    }
    return statementElement;
}

/** creates an html element containing all rdf statements for the given rdf subject */
function createElementSubject(subject) {
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

/** populates the html container with rdf statements from the triple store */
async function populate(containerElement) {
    const fdpUrl = prefixes.fdp;

    // get core rdf ontologies
    for (const key of ["fdp-o", "rdf", "rdfs"]) {
        await parseFromUrl(prefixes[key]);
    }

    // wait for all promises to be fulfilled
    if (recursiveParsePromises.length > 0) {
        console.debug("awaiting %d promises", recursiveParsePromises.length);
        await Promise.all(recursiveParsePromises);
        console.debug("promises fulfilled");
    }

    // infer relations etc.
    reason(prefixes.fdp);

    // populates the html page with rdf statements from the store
    console.debug("populate() called for url %s", fdpUrl);
    store.forSubjects(
        subject => {
            containerElement.appendChild(createElementSubject(subject));
            console.info("subject populated: %s", subject.value);
        },
        null,
        null,
        // only include subjects from the root fdp graph
        DataFactory.namedNode(fdpUrl),
    );
}

/**
 * gets rdf-turtle text from the specified url and parses it into the triple store
 * and parses prefix urls, recursively, up to specified depth
 */
async function parseFromUrl(url, maxDepth, depth) {
    if (depth === undefined) {
        depth = 0;
    }
    const ttl = await getTurtle(url);
    if (ttl) {
        // parse the turtle content (note that the use of parse() callbacks makes this
        // asynchronous, but we need them so we can recurse when finding a prefix)
        parser.parse(ttl, {
            onQuad: (error, quad) => {
                if (quad) {
                    // use a dedicated graph for each parsed url (each predicate)
                    const graph = DataFactory.namedNode(url);
                    // todo: can't we just modify the graph on the existing quad?
                    const newQuad = DataFactory.quad(
                        quad.subject,
                        quad.predicate,
                        quad.object,
                        graph);
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

/** gets rdf-turtle content from url */
async function getTurtle(url) {
    const requestOptions = {
        method: 'GET',
        headers: {'accept': mediatypeTextTurtle},
    };
    return await makeRequest(url, requestOptions);
}

/** executes an http request and returns the reponse body as text */
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