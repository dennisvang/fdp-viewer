import { MEDIATYPE_TURTLE, RdfStore } from "./rdf.js";

const CLASS_RDF_STATEMENT = "rdf-statement";
const CLASS_RELATED_RESOURCE = "related-resource";
const CLASS_SUBJECT = "subject";
const CLASS_SUBJECT_TITLE = "subject-title";
const CLASS_TITLE = "title";
const PARAM_RESOURCE_URL = "resource-url";

/** Maintains resource viewer state */
export class ResourceViewer {
    // private elements
    #container;
    #rdfStore;
    #relatedResourceIris;
    #rootUrl;

    constructor(container, rootUrl) {
        this.#container = container;
        this.#rootUrl = rootUrl;
        // initialize empty
        this.#rdfStore = new RdfStore();
        this.#relatedResourceIris = [];
        // intercept navigation events
        navigation.addEventListener("navigate", this.#navigationHandler.bind(this));
        console.debug("viewer created for %s", this.#rootUrl)
    }

    /** Handles navigation events using the JavaScript navigation API */
    #navigationHandler(event) {
        console.debug("nav event detected: %s, %s", event.navigationType, event.destination.url)
        // only same-origin navigation is handled here, which implies an internal
        // resource-url param is available
        event.intercept({
            handler: async () => {
                // note that, at this point, the location has already changed so it
                // matches the destination
                const destinationUrl = new URL(event.destination.url);
                const resourceUrl = destinationUrl.searchParams.get(PARAM_RESOURCE_URL);
                console.debug("intercepted navigation to %s", resourceUrl)
                await this.update(resourceUrl);
            }
        });
    }

    /** Updates the whole content based on the specified url */
    async update(url) {
        // fall back on root url if no url was provided
        const resourceUrl = url ? url : this.#rootUrl;
        // harvest resource statements and add them to the rdf store
        await this.#harvest(resourceUrl);
        // harvest statements from all the term URIs found in the store (to prepare for
        // reasoning and to determine human readable labels)
        // todo: optimize for efficiency (if necessary)
        for (const termUri of this.#rdfStore.getUniqueUris(this.#rootUrl)) {
            console.debug("harvesting %s", termUri)
            await this.#harvest(this.#mappedUri(termUri)).catch((reason) => {
                console.warn("failed to harvest %s\n(due to %s)", termUri, reason)
            });
        }
        // reason about the harvested triples and add inferred triples to the rdf store
        // (mainly used to infer navigation relations independently of the LDP statements)
        this.#rdfStore.reason(resourceUrl);
        // find uris representing related resources, for internal navigation
        this.#relatedResourceIris = this.#rdfStore.getRelatedResourceIris(resourceUrl);
        console.debug(this.#relatedResourceIris)
        // populate the content container based on the harvested resource
        await this.#populate(resourceUrl);
    }

    /** Replaces IRIs with corresponding prefixes */
    #withPrefixes(value) {
        for (const [prefix, prefixIRI] of Object.entries(this.#rdfStore.getPrefixes())) {
            value = value.replace(prefixIRI, prefix + ":");
        }
        return value;
    }

    /** Tries to get a human readable label for an IRI */
    #getLabel(iri, language="en") {
        // default to prefix substitution
        let label = this.#withPrefixes(iri);
        // try to get actual label for iri
        // todo: do we need to cache this? or is that premature optimization?
        const labels = this.#rdfStore.getObjectsForSubjectAndPredicate(
            iri, "http://www.w3.org/2000/01/rdf-schema#label"
        );
        const languageTag = "@" + language;
        for (const labelCandidate of labels) {
            if (labelCandidate.id.endsWith(languageTag) || !labelCandidate.id.includes("@")) {
                label = labelCandidate.id.replaceAll("\"", "").replaceAll(languageTag, "");
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

    /**
     * Creates a clickable HTML element for an IRI. Human readable link text is obtained
     * from RDF statements if available. Known prefixes are substituted in the element
     * title which appears on mouse-hover, for improved readability.
     * Automatically distinguishes between cross-origin and same-origin IRIs.
     */
    #createElementIRI(iri, ...classes) {
        const labelIri = iri;
        let navigationIri = iri;
        let navigationTarget = "_blank";
        // handle same-origin navigation
        if (this.#relatedResourceIris.includes(iri)) {
            // highlight the element via css class
            classes.push(CLASS_RELATED_RESOURCE);
            // convert href for same-origin navigation with the term.id as url param
            const location = new URL(window.location);
            location.searchParams.set(PARAM_RESOURCE_URL, iri);
            navigationIri = location.href;
            navigationTarget = "_self";
        }
        // create element
        const iriElement = document.createElement("a");
        iriElement.href = navigationIri;
        iriElement.textContent = this.#getLabel(labelIri);
        iriElement.title = this.#withPrefixes(labelIri);
        iriElement.target = navigationTarget;
        if (classes && classes.length) {
            iriElement.classList.add(classes);
        }
        return iriElement;
    }

    /** Creates an HTML element for a fancy clickable title */
    #createElementForSubjectTitle(iri) {
        const titleElement = document.createElement("div");
        titleElement.classList.add(CLASS_TITLE);
        titleElement.appendChild(this.#createElementIRI(iri, CLASS_SUBJECT_TITLE));
        return titleElement;
    }

    /**
     * Creates an HTML element representing an RDF term (subject, predicate, or object)
     */
    #createElementForTerm(term) {
        let termElement;
        if (term.termType === "Literal") {
            termElement = document.createElement("span");
            termElement.textContent = this.#withPrefixes(term.id);
        } else {
            const elementClasses = [];
            termElement = this.#createElementIRI(term.id, ...elementClasses);
        }
        termElement.classList.add("rdf-term");
        return termElement;
    }

    /**
     * Creates an HTML element containing a single RDF statement,
     * consisting of RDF terms <subject> <predicate> <object>.
     */
    #createElementForStatement(quad) {
        let statementElement = document.createElement("div");
        statementElement.classList.add(CLASS_RDF_STATEMENT);
        for (const termName of ["subject", "predicate", "object"]) {
            const element = this.#createElementForTerm(quad[termName]);
            element.classList.add("rdf-" + termName);
            statementElement.appendChild(element);
        }
        return statementElement;
    }

    /**
     * Creates an HTML element containing all RDF statements for the given RDF subject
     */
    #createElementForSubject(url, subject) {
        const subjectElement = document.createElement("div");
        subjectElement.classList.add(CLASS_SUBJECT);
        subjectElement.id = subject.id;
        subjectElement.appendChild(this.#createElementForSubjectTitle(subject.id));
        this.#rdfStore.getQuadsForGraphSubject(url, subject).forEach(quad => {
            subjectElement.appendChild(this.#createElementForStatement(quad));
        });
        return subjectElement;
    }

    /**
     * Populates the content container based on statements from the RDF store about
     * the specified resource. The container is cleared first.
     */
    async #populate(url) {
        // clear
        this.#container.replaceChildren();
        // iterate over all rdf subjects from the graph for the specified resource url
        this.#rdfStore.getSubjectsForGraph(url).forEach(subject => {
            this.#container.appendChild(this.#createElementForSubject(url, subject));
        });
    }

    /**
     * Updates the RdfStore based on the RDF turtle representation harvested from the
     * specified URL. Each resource representation is stored in its own graph,
     * identified by the resource url.
     */
    async #harvest(url) {
        const turtle = await this.#requestTurtle(url);
        // todo: only call parseTurtle if the url is not in the rdf store yet
        await this.#rdfStore.parseTurtle(turtle, url);
    }

    /** Executes an HTTP GET request for RDF turtle and returns the response body as text */
    async #requestTurtle(url) {
        // enforce https
        url = url.replace("http://", "https://");
        // specify options to get rdf-turtle
        const options = {
            method: "GET",
            headers: {"accept": MEDIATYPE_TURTLE},
        };
        // generic fetch request
        console.debug("fetching %s from %s", options.headers.accept, url);
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        console.debug("got success response from %s", url);
        return await response.text();
    }

    /** Maps a URI to another as workaround for CORS and XML issues.
     * - HTTP redirects and CORS prevent download via purl, so use the final url instead
     * - Some ontologies are only available in xml, which n3 cannot parse, so use custom
     * TODO: Replace by a proper fix. For example, CORS issues could be prevented by
     *  providing a proxy endpoint, and a remote service could parse XML and convert it
     *  to ttl.
     */
    #mappedUri(uri) {
        const workaroundMap = {
            "http://purl.org/dc/terms/": "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
            "https://w3id.org/fdp/fdp-o": "ontologies/fdp-o.ttl",
        };
        const mappedUri = workaroundMap[uri];
        if (mappedUri) {
            console.warn("using workaround to map %s to %s", uri, mappedUri)
        }
        return mappedUri || uri;
    }
}
