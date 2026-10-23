// https://github.com/rdfjs/N3.js/ (repo)
// https://rdf.js.org/N3.js/ (docs)
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

import { DataFactory, Parser, Store } from "https://unpkg.com/n3/browser/n3.esm.min.js";

export const MEDIATYPE_TURTLE = "text/turtle";

const DCTERMS_IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
const LDP_HASMEMBER_RELATION = "http://www.w3.org/ns/ldp#hasMemberRelation"

// map known prefix URIs to URLs that can be resolved from a browser (w.r.t. CORS, XML, etc.)
const KNOWN_PREFIX_MAP = {
    "http://purl.org/dc/terms/": "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#": null,  // works as is
    "http://www.w3.org/2000/01/rdf-schema#": null,  // works as is
    // "http://www.w3.org/2001/XMLSchema#": null,  // fails: CORS header missing and only available as XML
    "http://www.w3.org/ns/dcat#": null,  // works as is
    "http://www.w3.org/ns/ldp#": null,  // works as is
    // "http://xmlns.com/foaf/0.1/": null,  // fails: only available as XML
    "https://w3id.org/fdp/fdp-o#": "ontologies/fdp-o.ttl",  // only available as XML
};

/** Maintains rdf store state */
export class RdfStore {
    #prefixes;
    #store;

    constructor() {
        this.#prefixes = {};
        this.#store = new Store();
    }

    /**
     * Parses an RDF turtle string into the triple store using the specified uri as
     * graph uri. Also updates the #prefixes object.
     */
    async parseTurtle(turtle, uri) {
        // use a dedicated graph for each parsed uri
        const graph = uri ? DataFactory.namedNode(uri) : DataFactory.defaultGraph();
        const turtleParser = new Parser({ format: MEDIATYPE_TURTLE });
        // note that the use of parse() with options/callbacks makes this asynchronous
        turtleParser.parse(turtle, {
            onQuad: (error, quad) => {
                if (quad) {
                    const newQuad = DataFactory.quad(
                        quad.subject, quad.predicate, quad.object, graph
                    );
                    this.#store.add(newQuad);
                    console.debug("added to store: %s (graph: %s)", newQuad.subject.id, newQuad.graph.id);
                }
                if (error) {
                    console.warn("failed to parse quad for %s:\n%s", uri, error);
                }
            },
            onPrefix: (prefix, iri) => {
                this.#prefixes[prefix] = iri.id;
            },
        });
    }

    /**
     * Returns an array of IRIs representing parents and children of the specified
     * RDF subject. These represent navigation links.
     */
    getRelatedResourceIris(subjectIris) {
        // as a workaround for the possible trailing slash discrepancy between root
        // subject URI and base URI, we need to consider multiple URIs...
        // however, ideally we would only have to consider a single subject URI
        const childNavigationPredicates = [];
        for (const subjectIri of subjectIris) {
            // use the LDP statements to figure out which predicate links to children
            // (this relation is not defined on the subject itself, but on an LDP
            // container which is part of the graph identified by the current subject)
            childNavigationPredicates.push(...this.#store.getObjects(
                null,
                LDP_HASMEMBER_RELATION,
                DataFactory.namedNode(subjectIri),
            ));
        }
        // again the workaround for possible root trailing slash discrepancy
        const children = [];
        for (const subjectIri of subjectIris) {
            // there *should* be only one LDP hasMemberRelation per LDP container, but an
            // RDF document *could* define multiple LDP containers with different
            // hasMemberRelation objects, so we iterate over (possibly) multiple predicates
            for (const childNavigationPredicate of childNavigationPredicates) {
                const childUris = this.#store.getObjects(
                    DataFactory.namedNode(subjectIri),
                    childNavigationPredicate,
                    null,
                ).map(c => c.id);
                children.push(...childUris);
            }
        }
        // again the workaround for possible root trailing slash discrepancy
        const parents = [];
        for (const subjectIri of subjectIris) {
            parents.push(...this.#store.getObjects(
                DataFactory.namedNode(subjectIri),
                // LDP does not provide a way to specify the parent relation, so use dcterms
                DataFactory.namedNode(DCTERMS_IS_PART_OF),
                null,
            ).map(p => p.id));
        }
        console.info(parents)
        // unique array of IRIs from parents and children
        return [... new Set([...children, ...parents])];
    }

    /** Returns true if the specified graph exists */
    graphExists(graphUri) {
        return this.#store.has(null, null, null, DataFactory.namedNode(graphUri));
    }

    /**
     * Gets all RDF subjects from the specified resource's graph.
     */
    getSubjectsForGraph(graphUri) {
        return this.#store.getSubjects(null, null, DataFactory.namedNode(graphUri));
    }

    /**
     * Returns all RDF quads from the specified resource's graph matching the subject.
     */
    getQuadsForGraphSubject(graphUri, subject) {
        return this.#store.match(subject, null, null, DataFactory.namedNode(graphUri));
    }

    /** Returns all RDF objects matching the subject and predicate, from all graphs */
    getObjectsForSubjectAndPredicate(subject, predicate) {
        return this.#store.getObjects(subject, predicate, null);
    }

    /** Returns known prefixes (populated via parser) */
    getPrefixes() {
        return this.#prefixes;
    }

    /**
     * Returns a list of unique URIs based on all named nodes in the store's rootUri
     * graph. Same-origin URIs are excluded based on the specified rootUri.
     * Prefix base URIs are included, but not their individual term URIS. Non-prefix
     * cross-origin URIs are all included. This is because we also want to know labels
     * etc. for URIs that may not have been specified as prefix.
     */
    getKnownPrefixUrls() {
        const resolvableUrls = [];
        for (const [prefixUri, resolvableUrl] of Object.entries(KNOWN_PREFIX_MAP)) {
            resolvableUrls.push(resolvableUrl || prefixUri);
        }
        return resolvableUrls;
    }
}
