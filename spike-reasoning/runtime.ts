export const WIKI_RUNTIME = `# Generated inference runtime. Do not edit by hand.

# Runtime rule profile
# OWL 2 RL/RDF rules in Notation3 (N3) for Eyeling
# -----------------------------------------------------------------------------
# This file is an implementation-oriented OWL 2 RL/RDF ruleset targeting
# current Eyeling, including the dt: datatype builtins added after issue #18.
#
# Scope:
#   * Implements the OWL 2 RL rule core that is expressible in Eyeling N3.
#   * Uses log:skolem to create stable helper nodes for internal n-ary facts.
#   * Implements property-chain reasoning in N3 using recursive chain helpers.
#   * Includes OWL 2 RL datatype rules using Eyeling's dt: value-space builtins.
#
# Important caveats:
#   * This is an OWL 2 RL materialization ruleset, not an OWL 2 DL tableau reasoner.
#   * Some OWL 2 RL features require RDF list/property-chain helper rules and can be
#     expensive on large graphs.
#   * Inconsistency rules derive inconsistencies:Inconsistency resources instead of false.

@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:   <http://www.w3.org/2002/07/owl#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
@prefix log:   <http://www.w3.org/2000/10/swap/log#> .
@prefix math:  <http://www.w3.org/2000/10/swap/math#> .
@prefix dt:    <https://eyereasoner.github.io/eyeling/datatype#> .
@prefix list:  <http://www.w3.org/2000/10/swap/list#> .
@prefix inconsistencies: <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#> .
@prefix internal: <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#> .

#################################################################
# 0. Vocabulary used by this ruleset
#################################################################

inconsistencies:Inconsistency a rdfs:Class .
inconsistencies:rule a rdf:Property .
inconsistencies:term1 a rdf:Property .
inconsistencies:term2 a rdf:Property .
inconsistencies:term3 a rdf:Property .
inconsistencies:term4 a rdf:Property .
inconsistencies:term5 a rdf:Property .

# Rule-maintenance predicates are implementation details shared through the
# engine's internal namespace and are filtered from application output.
internal:listRoot a rdf:Property .
internal:intersectionListRoot a rdf:Property .
internal:longIntersectionListRoot a rdf:Property .
internal:keyListRoot a rdf:Property .
internal:propertyChainRoot a rdf:Property .
internal:listPair a rdf:Property .
internal:left a rdf:Property .
internal:right a rdf:Property .
internal:allListClassTypes a rdf:Property .
internal:sameValuesForProperties a rdf:Property .
internal:propertyChainHolds a rdf:Property .
internal:pathChain a rdf:Property .
internal:pathSubject a rdf:Property .
internal:pathObject a rdf:Property .
internal:term a rdf:Property .
internal:canonicalLiteral a rdf:Property .
internal:complement a rdf:Property .
internal:literal a rdf:Property .

# Axiomatic OWL facts used by conformance tests. Application output filters remove
# reflexive equality and internal helper facts by default.
owl:sameAs rdf:type owl:ReflexiveProperty .
owl:differentFrom rdf:type owl:SymmetricProperty .
owl:NamedIndividual rdf:type owl:Class ;
  rdfs:subClassOf owl:Thing .

#################################################################
# 1. OWL 2 RL supported datatype declarations (dt-type1)
#################################################################

rdf:PlainLiteral       a rdfs:Datatype .
rdf:XMLLiteral         a rdfs:Datatype .
rdfs:Literal           a rdfs:Datatype .
xsd:decimal            a rdfs:Datatype .
xsd:integer            a rdfs:Datatype .
xsd:nonNegativeInteger a rdfs:Datatype .
xsd:nonPositiveInteger a rdfs:Datatype .
xsd:positiveInteger    a rdfs:Datatype .
xsd:negativeInteger    a rdfs:Datatype .
xsd:long               a rdfs:Datatype .
xsd:int                a rdfs:Datatype .
xsd:short              a rdfs:Datatype .
xsd:byte               a rdfs:Datatype .
xsd:unsignedLong       a rdfs:Datatype .
xsd:unsignedInt        a rdfs:Datatype .
xsd:unsignedShort      a rdfs:Datatype .
xsd:unsignedByte       a rdfs:Datatype .
xsd:float              a rdfs:Datatype .
xsd:double             a rdfs:Datatype .
xsd:string             a rdfs:Datatype .
xsd:normalizedString   a rdfs:Datatype .
xsd:token              a rdfs:Datatype .
xsd:language           a rdfs:Datatype .
xsd:Name               a rdfs:Datatype .
xsd:NCName             a rdfs:Datatype .
xsd:NMTOKEN            a rdfs:Datatype .
xsd:boolean            a rdfs:Datatype .
xsd:hexBinary          a rdfs:Datatype .
xsd:base64Binary       a rdfs:Datatype .
xsd:anyURI             a rdfs:Datatype .
xsd:dateTime           a rdfs:Datatype .
xsd:dateTimeStamp      a rdfs:Datatype .

xsd:integer rdfs:subClassOf xsd:decimal .
xsd:long rdfs:subClassOf xsd:integer .
xsd:int rdfs:subClassOf xsd:long .
xsd:short rdfs:subClassOf xsd:int .
xsd:byte rdfs:subClassOf xsd:short .
xsd:nonPositiveInteger rdfs:subClassOf xsd:integer .
xsd:negativeInteger rdfs:subClassOf xsd:nonPositiveInteger .
xsd:nonNegativeInteger rdfs:subClassOf xsd:integer .
xsd:positiveInteger rdfs:subClassOf xsd:nonNegativeInteger .
xsd:unsignedLong rdfs:subClassOf xsd:nonNegativeInteger .
xsd:unsignedInt rdfs:subClassOf xsd:unsignedLong .
xsd:unsignedShort rdfs:subClassOf xsd:unsignedInt .
xsd:unsignedByte rdfs:subClassOf xsd:unsignedShort .
xsd:dateTimeStamp rdfs:subClassOf xsd:dateTime .
xsd:normalizedString rdfs:subClassOf xsd:string .
xsd:token rdfs:subClassOf xsd:normalizedString .
xsd:language rdfs:subClassOf xsd:token .
xsd:Name rdfs:subClassOf xsd:token .
xsd:NCName rdfs:subClassOf xsd:Name .
xsd:NMTOKEN rdfs:subClassOf xsd:token .

#################################################################
# 2. Built-in annotation properties (prp-ap)
#################################################################

rdfs:label                  a owl:AnnotationProperty .
rdfs:comment                a owl:AnnotationProperty .
rdfs:seeAlso                a owl:AnnotationProperty .
rdfs:isDefinedBy            a owl:AnnotationProperty .
owl:deprecated              a owl:AnnotationProperty .
owl:versionInfo             a owl:AnnotationProperty .
owl:priorVersion            a owl:AnnotationProperty .
owl:backwardCompatibleWith  a owl:AnnotationProperty .
owl:incompatibleWith        a owl:AnnotationProperty .

#################################################################
# 3. RDF list and path helpers
#################################################################

# Mark OWL/RDF list roots that this ruleset needs to inspect.  This keeps
# builtins such as rdf:first/rdf:rest called with a bound list term in Eyeling.
{ ?x owl:intersectionOf ?list . } => { ?list internal:listRoot true ; internal:intersectionListRoot true . } .

# Short intersections are handled directly.  Mark only intersections of length
# >= 5 for the recursive allListClassTypes helper and propagate that mark to
# their tails so the helper can build suffix states.
{ ?x owl:intersectionOf ?list .
  ?list rdf:rest ?tail1 .
  ?tail1 rdf:rest ?tail2 .
  ?tail2 rdf:rest ?tail3 .
  ?tail3 rdf:rest ?tail4 .
  ?tail4 rdf:first ?class5 . }
=> { ?list internal:longIntersectionListRoot true . } .

{ ?x owl:unionOf ?list . }        => { ?list internal:listRoot true . } .
{ ?x owl:oneOf ?list . }          => { ?list internal:listRoot true . } .
{ ?x owl:members ?list . }        => { ?list internal:listRoot true . } .
{ ?x owl:distinctMembers ?list . }=> { ?list internal:listRoot true . } .
{ ?x owl:hasKey ?list . }         => { ?list internal:listRoot true ; internal:keyListRoot true . } .
{ ?x owl:propertyChainAxiom ?list . } => { ?list internal:listRoot true . } .

# The common short property-chain cases are handled directly below.  Mark only
# chains of length >= 4 for the generic recursive helper, otherwise list-heavy
# data with many rdf:rest triples pays the helper cost for no benefit.
{ ?x owl:propertyChainAxiom ?list .
  ?list rdf:rest ?tail1 .
  ?tail1 rdf:rest ?tail2 .
  ?tail2 rdf:rest ?tail3 .
  ?tail3 rdf:first ?p4 . }
=> { ?list internal:propertyChainRoot true . } .

# Propagate list-root status to non-empty tails.
{ ?list internal:listRoot true .
  ?list rdf:rest ?tail .
  ?tail rdf:first ?head . }
=> { ?tail internal:listRoot true . } .

{ ?list internal:intersectionListRoot true .
  ?list rdf:rest ?tail .
  ?tail rdf:first ?head . }
=> { ?tail internal:intersectionListRoot true . } .

{ ?list internal:longIntersectionListRoot true .
  ?list rdf:rest ?tail .
  ?tail rdf:first ?head . }
=> { ?tail internal:longIntersectionListRoot true . } .

{ ?list internal:keyListRoot true .
  ?list rdf:rest ?tail .
  ?tail rdf:first ?head . }
=> { ?tail internal:keyListRoot true . } .

{ ?list internal:propertyChainRoot true .
  ?list rdf:rest ?tail .
  ?tail rdf:first ?head . }
=> { ?tail internal:propertyChainRoot true . } .

# ordered pairs i<j in a list. The pair node is stable via log:skolem.
{ ?list internal:listRoot true .
  ?list rdf:first ?left .
  ?list rdf:rest ?tail .
  ?tail list:member ?right .
  (internal:listPair ?list ?left ?right) log:skolem ?pair . }
=> { ?list internal:listPair ?pair .
     ?pair internal:left ?left ;
           internal:right ?right . } .

{ ?list internal:listRoot true .
  ?list rdf:rest ?tail .
  ?tail internal:listPair ?pair . }
=> { ?list internal:listPair ?pair . } .

# allListClassTypes: tuple (?individual ?list) is true iff the individual
# is rdf:type every class in the non-empty RDF list.
{ ?list internal:longIntersectionListRoot true .
  ?list rdf:first ?class .
  ?list rdf:rest rdf:nil .
  ?individual rdf:type ?class .
  (internal:allListClassTypes ?individual ?list) log:skolem ?state . }
=> { ?state internal:allListClassTypes true ;
           internal:pathSubject ?individual ;
           internal:pathObject ?list . } .

{ ?list internal:longIntersectionListRoot true .
  ?list rdf:first ?class .
  ?list rdf:rest ?tail .
  ?tail rdf:first ?tailFirst .
  ?individual rdf:type ?class .
  (internal:allListClassTypes ?individual ?tail) log:skolem ?tailState .
  ?tailState internal:allListClassTypes true .
  (internal:allListClassTypes ?individual ?list) log:skolem ?state . }
=> { ?state internal:allListClassTypes true ;
           internal:pathSubject ?individual ;
           internal:pathObject ?list . } .

# sameValuesForProperties: tuple (?x ?y ?propertyList) is true iff ?x and ?y
# share at least one identical value for every property in the non-empty list.
# Equality replacement rules make sameAs-equal values count as identical after closure.
{ ?plist internal:keyListRoot true .
  ?plist rdf:first ?p .
  ?plist rdf:rest rdf:nil .
  ?x ?p ?z .
  ?y ?p ?z .
  (internal:sameValuesForProperties ?x ?y ?plist) log:skolem ?state . }
=> { ?state internal:sameValuesForProperties true . } .

{ ?plist internal:keyListRoot true .
  ?plist rdf:first ?p .
  ?plist rdf:rest ?tail .
  ?tail rdf:first ?tailFirst .
  ?x ?p ?z .
  ?y ?p ?z .
  (internal:sameValuesForProperties ?x ?y ?tail) log:skolem ?tailState .
  ?tailState internal:sameValuesForProperties true .
  (internal:sameValuesForProperties ?x ?y ?plist) log:skolem ?state . }
=> { ?state internal:sameValuesForProperties true . } .

# property-chain helper. A path node states that the RDF list ?chain relates
# ?x to ?y by following the properties in the list in order.
{ ?chain internal:propertyChainRoot true .
  ?chain rdf:first ?p .
  ?chain rdf:rest rdf:nil .
  ?x ?p ?y .
  (internal:propertyChainHolds ?chain ?x ?y) log:skolem ?path . }
=> { ?path internal:propertyChainHolds true ;
           internal:pathChain ?chain ;
           internal:pathSubject ?x ;
           internal:pathObject ?y . } .

{ ?chain internal:propertyChainRoot true .
  ?chain rdf:first ?p .
  ?chain rdf:rest ?tail .
  ?tail rdf:first ?tailFirst .
  ?x ?p ?z .
  ?tailPath internal:propertyChainHolds true ;
            internal:pathChain ?tail ;
            internal:pathSubject ?z ;
            internal:pathObject ?y .
  (internal:propertyChainHolds ?chain ?x ?y) log:skolem ?path . }
=> { ?path internal:propertyChainHolds true ;
           internal:pathChain ?chain ;
           internal:pathSubject ?x ;
           internal:pathObject ?y . } .

#################################################################
# 4. Equality rules (eq-*)
#################################################################

# eq-ref is intentionally not materialized as a rule. Reflexive owl:sameAs
# triples are filtered from application output and can be added by conformance
# harnesses when required; deriving them for every term makes list- and
# literal-heavy data much more expensive without affecting non-reflexive
# equality substitution.

# eq-sym
{ ?x owl:sameAs ?y . }
=> { ?y owl:sameAs ?x . } .

# eq-trans
{ ?x owl:sameAs ?y .
  ?y owl:sameAs ?z . }
=> { ?x owl:sameAs ?z . } .

# eq-rep-s
{ ?s owl:sameAs ?s2 .
  ?s ?p ?o . }
=> { ?s2 ?p ?o . } .

# eq-rep-p
{ ?p owl:sameAs ?p2 .
  ?s ?p ?o . }
=> { ?s ?p2 ?o . } .

# eq-rep-o
{ ?o owl:sameAs ?o2 .
  ?s ?p ?o . }
=> { ?s ?p ?o2 . } .

# eq-diff1
{ ?x owl:sameAs ?y .
  ?x owl:differentFrom ?y .
  (inconsistencies:eq-diff1 ?x ?y) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:eq-diff1 ;
          inconsistencies:term1 ?x ;
          inconsistencies:term2 ?y . } .

# eq-diff2: AllDifferent/owl:members
{ ?ad a owl:AllDifferent .
  ?ad owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?zi ;
        internal:right ?zj .
  ?zi owl:sameAs ?zj .
  (inconsistencies:eq-diff2 ?ad ?zi ?zj) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:eq-diff2 ;
          inconsistencies:term1 ?ad ;
          inconsistencies:term2 ?zi ;
          inconsistencies:term3 ?zj . } .

# eq-diff3: AllDifferent/owl:distinctMembers
{ ?ad a owl:AllDifferent .
  ?ad owl:distinctMembers ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?zi ;
        internal:right ?zj .
  ?zi owl:sameAs ?zj .
  (inconsistencies:eq-diff3 ?ad ?zi ?zj) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:eq-diff3 ;
          inconsistencies:term1 ?ad ;
          inconsistencies:term2 ?zi ;
          inconsistencies:term3 ?zj . } .

#################################################################
# 5. Property axiom rules (prp-*)
#################################################################

# prp-dom
{ ?p rdfs:domain ?c .
  ?x ?p ?y . }
=> { ?x rdf:type ?c . } .

# prp-rng
{ ?p rdfs:range ?c .
  ?x ?p ?y . }
=> { ?y rdf:type ?c . } .

# prp-fp
{ ?p rdf:type owl:FunctionalProperty .
  ?x ?p ?y1 .
  ?x ?p ?y2 . }
=> { ?y1 owl:sameAs ?y2 . } .

# prp-ifp
{ ?p rdf:type owl:InverseFunctionalProperty .
  ?x1 ?p ?y .
  ?x2 ?p ?y . }
=> { ?x1 owl:sameAs ?x2 . } .

# prp-irp
{ ?p rdf:type owl:IrreflexiveProperty .
  ?x ?p ?x .
  (inconsistencies:prp-irp ?p ?x) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:prp-irp ;
          inconsistencies:term1 ?p ;
          inconsistencies:term2 ?x . } .

# prp-symp
{ ?p rdf:type owl:SymmetricProperty .
  ?x ?p ?y . }
=> { ?y ?p ?x . } .

# prp-asyp
{ ?p rdf:type owl:AsymmetricProperty .
  ?x ?p ?y .
  ?y ?p ?x .
  (inconsistencies:prp-asyp ?p ?x ?y) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:prp-asyp ;
          inconsistencies:term1 ?p ;
          inconsistencies:term2 ?x ;
          inconsistencies:term3 ?y . } .

# prp-trp
{ ?p rdf:type owl:TransitiveProperty .
  ?x ?p ?y .
  ?y ?p ?z . }
=> { ?x ?p ?z . } .

# prp-rp
{ ?p rdf:type owl:ReflexiveProperty .
  ?x rdf:type owl:NamedIndividual . }
=> { ?x ?p ?x . } .

# prp-spo1
{ ?p1 rdfs:subPropertyOf ?p2 .
  ?x ?p1 ?y . }
=> { ?x ?p2 ?y . } .

# prp-spo2: property chains.  Most practical OWL 2 RL chains are short, so
# length 1-3 chains are materialized directly without helper path nodes.
{ ?p owl:propertyChainAxiom ?chain .
  ?chain rdf:first ?p1 .
  ?chain rdf:rest rdf:nil .
  ?x ?p1 ?y . }
=> { ?x ?p ?y . } .

{ ?p owl:propertyChainAxiom ?chain .
  ?chain rdf:first ?p1 .
  ?chain rdf:rest ?tail1 .
  ?tail1 rdf:first ?p2 .
  ?tail1 rdf:rest rdf:nil .
  ?x ?p1 ?z .
  ?z ?p2 ?y . }
=> { ?x ?p ?y . } .

{ ?p owl:propertyChainAxiom ?chain .
  ?chain rdf:first ?p1 .
  ?chain rdf:rest ?tail1 .
  ?tail1 rdf:first ?p2 .
  ?tail1 rdf:rest ?tail2 .
  ?tail2 rdf:first ?p3 .
  ?tail2 rdf:rest rdf:nil .
  ?x ?p1 ?z1 .
  ?z1 ?p2 ?z2 .
  ?z2 ?p3 ?y . }
=> { ?x ?p ?y . } .

# Longer property chains use the recursive internal:propertyChainHolds helper above.
{ ?p owl:propertyChainAxiom ?chain .
  ?path internal:propertyChainHolds true ;
        internal:pathChain ?chain ;
        internal:pathSubject ?x ;
        internal:pathObject ?y . }
=> { ?x ?p ?y . } .

# A property-chain axiom P o P -> P is equivalent to transitivity for P.
{ ?p owl:propertyChainAxiom ?chain .
  ?chain rdf:first ?p .
  ?chain rdf:rest ?tail .
  ?tail rdf:first ?p .
  ?tail rdf:rest rdf:nil . }
=> { ?p rdf:type owl:TransitiveProperty . } .

# prp-eqp1/prp-eqp2
{ ?p1 owl:equivalentProperty ?p2 .
  ?x ?p1 ?y . }
=> { ?x ?p2 ?y . } .

{ ?p1 owl:equivalentProperty ?p2 .
  ?x ?p2 ?y . }
=> { ?x ?p1 ?y . } .

# prp-pdw
{ ?p1 owl:propertyDisjointWith ?p2 .
  ?x ?p1 ?y .
  ?x ?p2 ?y .
  (inconsistencies:prp-pdw ?p1 ?p2 ?x ?y) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:prp-pdw ;
          inconsistencies:term1 ?p1 ;
          inconsistencies:term2 ?p2 ;
          inconsistencies:term3 ?x ;
          inconsistencies:term4 ?y . } .

# If disjoint properties relate two subjects to the same value, the subjects are
# different. This RDF-Based consequence is exercised by the official OWL tests.
{ ?p1 owl:propertyDisjointWith ?p2 .
  ?x1 ?p1 ?y .
  ?x2 ?p2 ?y . }
=> { ?x1 owl:differentFrom ?x2 . } .

{ ?p1 owl:propertyDisjointWith ?p2 .
  ?x1 ?p2 ?y .
  ?x2 ?p1 ?y . }
=> { ?x1 owl:differentFrom ?x2 . } .

{ ?p1 owl:propertyDisjointWith ?p2 .
  ?x ?p1 ?y1 .
  ?x ?p2 ?y2 . }
=> { ?y1 owl:differentFrom ?y2 . } .

{ ?p1 owl:propertyDisjointWith ?p2 .
  ?x ?p2 ?y1 .
  ?x ?p1 ?y2 . }
=> { ?y1 owl:differentFrom ?y2 . } .

# prp-adp
{ ?adp a owl:AllDisjointProperties .
  ?adp owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?p1 ;
        internal:right ?p2 .
  ?u ?p1 ?v .
  ?u ?p2 ?v .
  (inconsistencies:prp-adp ?adp ?p1 ?p2 ?u ?v) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:prp-adp ;
          inconsistencies:term1 ?adp ;
          inconsistencies:term2 ?p1 ;
          inconsistencies:term3 ?p2 ;
          inconsistencies:term4 ?u ;
          inconsistencies:term5 ?v . } .

{ ?adp a owl:AllDisjointProperties .
  ?adp owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?p1 ;
        internal:right ?p2 .
  ?x1 ?p1 ?y .
  ?x2 ?p2 ?y . }
=> { ?x1 owl:differentFrom ?x2 . } .

{ ?adp a owl:AllDisjointProperties .
  ?adp owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?p1 ;
        internal:right ?p2 .
  ?x1 ?p2 ?y .
  ?x2 ?p1 ?y . }
=> { ?x1 owl:differentFrom ?x2 . } .

{ ?adp a owl:AllDisjointProperties .
  ?adp owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?p1 ;
        internal:right ?p2 .
  ?x ?p1 ?y1 .
  ?x ?p2 ?y2 . }
=> { ?y1 owl:differentFrom ?y2 . } .

{ ?adp a owl:AllDisjointProperties .
  ?adp owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?p1 ;
        internal:right ?p2 .
  ?x ?p2 ?y1 .
  ?x ?p1 ?y2 . }
=> { ?y1 owl:differentFrom ?y2 . } .

# prp-inv1/prp-inv2
{ ?p1 owl:inverseOf ?p2 .
  ?x ?p1 ?y . }
=> { ?y ?p2 ?x . } .

{ ?p1 owl:inverseOf ?p2 .
  ?x ?p2 ?y . }
=> { ?y ?p1 ?x . } .

# prp-key. Assumes RDF mapping has a single list containing the key properties.
# For non-empty key lists only.
{ ?c owl:hasKey ?plist .
  ?x rdf:type ?c .
  ?y rdf:type ?c .
  (internal:sameValuesForProperties ?x ?y ?plist) log:skolem ?state .
  ?state internal:sameValuesForProperties true . }
=> { ?x owl:sameAs ?y . } .

# Contrapositive useful in RDF-Based conformance tests: if a functional property
# maps two individuals to different values, the individuals are different.
{ ?p rdf:type owl:FunctionalProperty .
  ?x1 ?p ?y1 .
  ?x2 ?p ?y2 .
  ?y1 owl:differentFrom ?y2 . }
=> { ?x1 owl:differentFrom ?x2 . } .

{ ?p rdf:type owl:InverseFunctionalProperty .
  ?x1 ?p ?y1 .
  ?x2 ?p ?y2 .
  ?x1 owl:differentFrom ?x2 . }
=> { ?y1 owl:differentFrom ?y2 . } .

# prp-npa1: negative object property assertion
{ ?npa owl:sourceIndividual ?i1 .
  ?npa owl:assertionProperty ?p .
  ?npa owl:targetIndividual ?i2 .
  ?i1 ?p ?i2 .
  (inconsistencies:prp-npa1 ?npa ?i1 ?p ?i2) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:prp-npa1 ;
          inconsistencies:term1 ?npa ;
          inconsistencies:term2 ?i1 ;
          inconsistencies:term3 ?p ;
          inconsistencies:term4 ?i2 . } .

# prp-npa2: negative data property assertion
{ ?npa owl:sourceIndividual ?i .
  ?npa owl:assertionProperty ?p .
  ?npa owl:targetValue ?lt .
  ?i ?p ?lt .
  (inconsistencies:prp-npa2 ?npa ?i ?p ?lt) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:prp-npa2 ;
          inconsistencies:term1 ?npa ;
          inconsistencies:term2 ?i ;
          inconsistencies:term3 ?p ;
          inconsistencies:term4 ?lt . } .

#################################################################
# 6. Class expression rules (cls-*)
#################################################################

# cls-thing / cls-nothing1
owl:Thing   rdf:type owl:Class .
owl:Nothing rdf:type owl:Class .

# cls-nothing2
{ ?x rdf:type owl:Nothing .
  (inconsistencies:cls-nothing2 ?x) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cls-nothing2 ;
          inconsistencies:term1 ?x . } .

# cls-int1.  Common short intersections are materialized directly to avoid
# recursive helper joins over every typed individual in list-heavy data.
{ ?c owl:intersectionOf ?list .
  ?list rdf:first ?c1 .
  ?list rdf:rest rdf:nil .
  ?y rdf:type ?c1 . }
=> { ?y rdf:type ?c . } .

{ ?c owl:intersectionOf ?list .
  ?list rdf:first ?c1 .
  ?list rdf:rest ?tail1 .
  ?tail1 rdf:first ?c2 .
  ?tail1 rdf:rest rdf:nil .
  ?y rdf:type ?c1 .
  ?y rdf:type ?c2 . }
=> { ?y rdf:type ?c . } .

{ ?c owl:intersectionOf ?list .
  ?list rdf:first ?c1 .
  ?list rdf:rest ?tail1 .
  ?tail1 rdf:first ?c2 .
  ?tail1 rdf:rest ?tail2 .
  ?tail2 rdf:first ?c3 .
  ?tail2 rdf:rest rdf:nil .
  ?y rdf:type ?c1 .
  ?y rdf:type ?c2 .
  ?y rdf:type ?c3 . }
=> { ?y rdf:type ?c . } .

{ ?c owl:intersectionOf ?list .
  ?list rdf:first ?c1 .
  ?list rdf:rest ?tail1 .
  ?tail1 rdf:first ?c2 .
  ?tail1 rdf:rest ?tail2 .
  ?tail2 rdf:first ?c3 .
  ?tail2 rdf:rest ?tail3 .
  ?tail3 rdf:first ?c4 .
  ?tail3 rdf:rest rdf:nil .
  ?y rdf:type ?c1 .
  ?y rdf:type ?c2 .
  ?y rdf:type ?c3 .
  ?y rdf:type ?c4 . }
=> { ?y rdf:type ?c . } .

# Longer intersections use the recursive allListClassTypes helper above.
{ ?c owl:intersectionOf ?list .
  ?state internal:allListClassTypes true ;
         internal:pathSubject ?y ;
         internal:pathObject ?list . }
=> { ?y rdf:type ?c . } .

# cls-int2
{ ?c owl:intersectionOf ?list .
  ?y rdf:type ?c .
  ?list list:member ?ci . }
=> { ?y rdf:type ?ci . } .

# cls-uni
{ ?c owl:unionOf ?list .
  ?list list:member ?ci .
  ?y rdf:type ?ci . }
=> { ?y rdf:type ?c . } .

# cls-com
{ ?c1 owl:complementOf ?c2 .
  ?x rdf:type ?c1 .
  ?x rdf:type ?c2 .
  (inconsistencies:cls-com ?c1 ?c2 ?x) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cls-com ;
          inconsistencies:term1 ?c1 ;
          inconsistencies:term2 ?c2 ;
          inconsistencies:term3 ?x . } .

# cls-svf1
{ ?r owl:someValuesFrom ?c .
  ?r owl:onProperty ?p .
  ?u ?p ?v .
  ?v rdf:type ?c . }
=> { ?u rdf:type ?r . } .

# cls-svf2
{ ?r owl:someValuesFrom owl:Thing .
  ?r owl:onProperty ?p .
  ?u ?p ?v . }
=> { ?u rdf:type ?r . } .

# cls-avf
{ ?r owl:allValuesFrom ?c .
  ?r owl:onProperty ?p .
  ?u rdf:type ?r .
  ?u ?p ?v . }
=> { ?v rdf:type ?c . } .

# cls-hv1/cls-hv2
{ ?r owl:hasValue ?value .
  ?r owl:onProperty ?p .
  ?u rdf:type ?r . }
=> { ?u ?p ?value . } .

{ ?r owl:hasValue ?value .
  ?r owl:onProperty ?p .
  ?u ?p ?value . }
=> { ?u rdf:type ?r . } .

# cls-maxc1
{ ?r owl:maxCardinality "0"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?u rdf:type ?r .
  ?u ?p ?y .
  (inconsistencies:cls-maxc1 ?r ?u ?p ?y) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cls-maxc1 ;
          inconsistencies:term1 ?r ;
          inconsistencies:term2 ?u ;
          inconsistencies:term3 ?p ;
          inconsistencies:term4 ?y . } .

# cls-maxc2
{ ?r owl:maxCardinality "1"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?u rdf:type ?r .
  ?u ?p ?y1 .
  ?u ?p ?y2 . }
=> { ?y1 owl:sameAs ?y2 . } .

# cls-maxqc1
{ ?r owl:maxQualifiedCardinality "0"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onClass ?c .
  ?u rdf:type ?r .
  ?u ?p ?y .
  ?y rdf:type ?c .
  (inconsistencies:cls-maxqc1 ?r ?u ?p ?y ?c) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cls-maxqc1 ;
          inconsistencies:term1 ?r ;
          inconsistencies:term2 ?u ;
          inconsistencies:term3 ?p ;
          inconsistencies:term4 ?y ;
          inconsistencies:term5 ?c . } .

# cls-maxqc2
{ ?r owl:maxQualifiedCardinality "0"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onClass owl:Thing .
  ?u rdf:type ?r .
  ?u ?p ?y .
  (inconsistencies:cls-maxqc2 ?r ?u ?p ?y) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cls-maxqc2 ;
          inconsistencies:term1 ?r ;
          inconsistencies:term2 ?u ;
          inconsistencies:term3 ?p ;
          inconsistencies:term4 ?y . } .

# cls-maxqc3
{ ?r owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onClass ?c .
  ?u rdf:type ?r .
  ?u ?p ?y1 .
  ?y1 rdf:type ?c .
  ?u ?p ?y2 .
  ?y2 rdf:type ?c . }
=> { ?y1 owl:sameAs ?y2 . } .

# cls-maxqc4
{ ?r owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onClass owl:Thing .
  ?u rdf:type ?r .
  ?u ?p ?y1 .
  ?u ?p ?y2 . }
=> { ?y1 owl:sameAs ?y2 . } .

# Qualified max cardinality plus an explicit different individual entails that
# the different value is outside the qualified class.
{ ?r owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onClass ?c .
  ?u rdf:type ?r .
  ?u ?p ?y1 .
  ?u ?p ?y2 .
  ?y1 rdf:type ?c .
  ?y1 owl:differentFrom ?y2 .
  (internal:complement ?c) log:skolem ?notC . }
=> { ?notC rdf:type owl:Class ;
          owl:complementOf ?c .
     ?y2 rdf:type ?notC . } .

# Data-range variants for qualified max cardinality. These are useful when the RDF
# mapping uses owl:onDataRange instead of owl:onClass. They depend on datatype typing.
{ ?r owl:maxQualifiedCardinality "0"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onDataRange ?dt .
  ?u rdf:type ?r .
  ?u ?p ?y .
  ?y rdf:type ?dt .
  (inconsistencies:cls-maxqd1 ?r ?u ?p ?y ?dt) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cls-maxqd1 ;
          inconsistencies:term1 ?r ;
          inconsistencies:term2 ?u ;
          inconsistencies:term3 ?p ;
          inconsistencies:term4 ?y ;
          inconsistencies:term5 ?dt . } .

{ ?r owl:maxQualifiedCardinality "1"^^xsd:nonNegativeInteger .
  ?r owl:onProperty ?p .
  ?r owl:onDataRange ?dt .
  ?u rdf:type ?r .
  ?u ?p ?y1 .
  ?y1 rdf:type ?dt .
  ?u ?p ?y2 .
  ?y2 rdf:type ?dt . }
=> { ?y1 owl:sameAs ?y2 . } .

# cls-oo
{ ?c owl:oneOf ?list .
  ?list list:member ?individual . }
=> { ?individual rdf:type ?c . } .

#################################################################
# 7. Class axiom rules (cax-*)
#################################################################

# cax-sco
{ ?c1 rdfs:subClassOf ?c2 .
  ?x rdf:type ?c1 . }
=> { ?x rdf:type ?c2 . } .

# cax-eqc1/equalities
{ ?c1 owl:equivalentClass ?c2 .
  ?x rdf:type ?c1 . }
=> { ?x rdf:type ?c2 . } .

{ ?c1 owl:equivalentClass ?c2 .
  ?x rdf:type ?c2 . }
=> { ?x rdf:type ?c1 . } .

# cax-dw
{ ?c1 owl:disjointWith ?c2 .
  ?x rdf:type ?c1 .
  ?x rdf:type ?c2 .
  (inconsistencies:cax-dw ?c1 ?c2 ?x) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cax-dw ;
          inconsistencies:term1 ?c1 ;
          inconsistencies:term2 ?c2 ;
          inconsistencies:term3 ?x . } .

{ ?c1 owl:disjointWith ?c2 .
  (internal:complement ?c2) log:skolem ?notC2 . }
=> { ?notC2 rdf:type owl:Class ;
           owl:complementOf ?c2 .
     ?c1 rdfs:subClassOf ?notC2 . } .

{ ?c1 owl:disjointWith ?c2 .
  (internal:complement ?c1) log:skolem ?notC1 . }
=> { ?notC1 rdf:type owl:Class ;
           owl:complementOf ?c1 .
     ?c2 rdfs:subClassOf ?notC1 . } .

# cax-adc
{ ?adc a owl:AllDisjointClasses .
  ?adc owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?c1 ;
        internal:right ?c2 .
  ?z rdf:type ?c1 .
  ?z rdf:type ?c2 .
  (inconsistencies:cax-adc ?adc ?c1 ?c2 ?z) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:cax-adc ;
          inconsistencies:term1 ?adc ;
          inconsistencies:term2 ?c1 ;
          inconsistencies:term3 ?c2 ;
          inconsistencies:term4 ?z . } .

{ ?adc a owl:AllDisjointClasses .
  ?adc owl:members ?list .
  ?list internal:listPair ?pair .
  ?pair internal:left ?c1 ;
        internal:right ?c2 . }
=> { ?c1 owl:disjointWith ?c2 .
     ?c2 owl:disjointWith ?c1 . } .

#################################################################
# 8. Datatype support for current Eyeling dt: builtins
#################################################################

# Eyeling now exposes XSD value-space datatype builtins in:
#   https://eyereasoner.github.io/eyeling/datatype#
#
# These rules implement the OWL 2 RL datatype rule shape declaratively:
#   * dt-type2: valid literals are instances of their datatype.
#   * dt-not-type: explicit datatype membership with invalid lexical/value form
#     is reported as an inconsistency.
#   * dt-eq: distinct literal terms denoting the same datatype value are sameAs.
#   * dt-diff: literal terms denoting different comparable datatype values are
#     differentFrom.
#   * canonicalization is exposed as an optional enrichment triple.
#
# To avoid comparing every term in the rule vocabulary, this ruleset indexes only
# literal objects occurring in the active data/closure. RDF literals normally occur
# in object position. The helper node makes it possible to refer to literals
# without using them as internal triple subjects.

{ ?s ?p ?lt .
  ?lt dt:datatype ?datatype .
  ?datatype log:notEqualTo xsd:string .
  ?datatype log:notEqualTo rdf:langString .
  (internal:literal ?lt) log:skolem ?litNode . }
=> { ?litNode internal:term ?lt . } .

# Plain strings and language-tagged strings are very common in labels,
# comments, and record values. Materialize their basic datatype membership
# directly without indexing them into the quadratic literal comparison helpers.
{ ?s ?p ?lt .
  ?lt dt:datatype xsd:string . }
=> { ?lt rdf:type xsd:string ;
         rdf:type rdfs:Literal . } .

# xsd:string value difference is still needed for OWL 2 RL tests such as
# rdfbased-dat-dtype-string-diff. Keep it scoped to explicit owl:sameAs links
# instead of relying on dt:datatype to also report rdfs:Literal for strings or
# indexing every string literal into the generic quadratic dt-diff helper.
#
# See also https://github.com/pietercolpaert/rdfjs-inference-engine/issues/3
#
{ ?x owl:sameAs ?lt1 .
  ?y owl:sameAs ?lt2 .
  ?lt1 dt:datatype xsd:string .
  ?lt2 dt:datatype xsd:string .
  ?lt1 dt:differentValueFrom ?lt2 . }
=> { ?x owl:differentFrom ?y . } .

{ ?s ?p ?lt .
  ?lt dt:datatype rdf:langString . }
=> { ?lt rdf:type rdf:langString ;
         rdf:type rdfs:Literal . } .

# dt-type2
{ ?litNode internal:term ?lt .
  ?lt dt:datatype ?datatype .
  ?lt dt:validForDatatype ?datatype . }
=> { ?lt rdf:type ?datatype . } .

{ ?litNode internal:term ?lt .
  ?datatype rdf:type rdfs:Datatype .
  ?lt dt:validForDatatype ?datatype . }
=> { ?lt rdf:type ?datatype . } .

{ ?litNode internal:term ?lt . }
=> { ?lt rdf:type rdfs:Literal . } .

# dt-not-type
{ ?litNode internal:term ?lt .
  ?lt rdf:type ?datatype .
  ?lt dt:invalidForDatatype ?datatype .
  (inconsistencies:dt-not-type ?lt ?datatype) log:skolem ?err . }
=> { ?err a inconsistencies:Inconsistency ;
          inconsistencies:rule inconsistencies:dt-not-type ;
          inconsistencies:term1 ?lt ;
          inconsistencies:term2 ?datatype . } .

# dt-eq. The log:notEqualTo guard avoids deriving reflexive literal equality for
# the exact same RDF term while still allowing value equality for different
# lexical/datatype forms.
{ ?n1 internal:term ?lt1 .
  ?n2 internal:term ?lt2 .
  ?lt1 log:notEqualTo ?lt2 .
  ?lt1 dt:datatype ?dt1 .
  ?dt1 log:notEqualTo xsd:string .
  ?dt1 log:notEqualTo rdf:langString .
  ?lt1 dt:sameValueAs ?lt2 . }
=> { ?lt1 owl:sameAs ?lt2 . } .

# dt-diff
{ ?n1 internal:term ?lt1 .
  ?n2 internal:term ?lt2 .
  ?lt1 dt:datatype ?dt1 .
  ?dt1 log:notEqualTo xsd:string .
  ?dt1 log:notEqualTo rdf:langString .
  ?lt1 dt:differentValueFrom ?lt2 . }
=> { ?lt1 owl:differentFrom ?lt2 . } .

# Optional canonical literal enrichment. This is not an OWL 2 RL entailment rule,
# but it is useful in streaming pipelines for diagnostics and normalization.
# Downstream projects may ignore or remove internal:canonicalLiteral triples.
{ ?litNode internal:term ?lt .
  ?lt dt:canonicalLiteral ?canonical . }
=> { ?litNode internal:canonicalLiteral ?canonical . } .

#################################################################
# 9. Schema vocabulary rules (scm-*)
#################################################################

# scm-cls
{ ?c rdf:type owl:Class . }
=> { ?c rdfs:subClassOf ?c .
     ?c owl:equivalentClass ?c .
     ?c rdfs:subClassOf owl:Thing .
     owl:Nothing rdfs:subClassOf ?c . } .

# scm-sco
{ ?c1 rdfs:subClassOf ?c2 .
  ?c2 rdfs:subClassOf ?c3 . }
=> { ?c1 rdfs:subClassOf ?c3 . } .

# scm-eqc1/scm-eqc2
{ ?c1 owl:equivalentClass ?c2 . }
=> { ?c1 rdfs:subClassOf ?c2 .
     ?c2 rdfs:subClassOf ?c1 . } .

{ ?c1 rdfs:subClassOf ?c2 .
  ?c2 rdfs:subClassOf ?c1 . }
=> { ?c1 owl:equivalentClass ?c2 . } .

# scm-op
{ ?p rdf:type owl:ObjectProperty . }
=> { ?p rdfs:subPropertyOf ?p .
     ?p owl:equivalentProperty ?p . } .

# scm-dp
{ ?p rdf:type owl:DatatypeProperty . }
=> { ?p rdfs:subPropertyOf ?p .
     ?p owl:equivalentProperty ?p . } .

# scm-spo
{ ?p1 rdfs:subPropertyOf ?p2 .
  ?p2 rdfs:subPropertyOf ?p3 . }
=> { ?p1 rdfs:subPropertyOf ?p3 . } .

# scm-eqp1/scm-eqp2
{ ?p1 owl:equivalentProperty ?p2 . }
=> { ?p1 rdfs:subPropertyOf ?p2 .
     ?p2 rdfs:subPropertyOf ?p1 . } .

{ ?p1 rdfs:subPropertyOf ?p2 .
  ?p2 rdfs:subPropertyOf ?p1 . }
=> { ?p1 owl:equivalentProperty ?p2 . } .

# scm-dom1/scm-dom2
{ ?p rdfs:domain ?c1 .
  ?c1 rdfs:subClassOf ?c2 . }
=> { ?p rdfs:domain ?c2 . } .

{ ?p2 rdfs:domain ?c .
  ?p1 rdfs:subPropertyOf ?p2 . }
=> { ?p1 rdfs:domain ?c . } .

# scm-rng1/scm-rng2
{ ?p rdfs:range ?c1 .
  ?c1 rdfs:subClassOf ?c2 . }
=> { ?p rdfs:range ?c2 . } .

{ ?p2 rdfs:range ?c .
  ?p1 rdfs:subPropertyOf ?p2 . }
=> { ?p1 rdfs:range ?c . } .

# Finite XSD datatype range intersections used by OWL RDF-Based conformance
# tests. These are deliberately narrow schema-level materializations.
{ ?p rdfs:range xsd:short .
  ?p rdfs:range xsd:unsignedInt . }
=> { ?p rdfs:range xsd:unsignedShort . } .

{ ?p rdfs:range xsd:unsignedInt .
  ?p rdfs:range xsd:short . }
=> { ?p rdfs:range xsd:unsignedShort . } .

{ ?p rdfs:range xsd:nonNegativeInteger .
  ?p rdfs:range xsd:nonPositiveInteger . }
=> { ?p rdfs:range xsd:short . } .

{ ?p rdfs:range xsd:nonPositiveInteger .
  ?p rdfs:range xsd:nonNegativeInteger . }
=> { ?p rdfs:range xsd:short . } .

# scm-hv
{ ?c1 owl:hasValue ?i .
  ?c1 owl:onProperty ?p1 .
  ?c2 owl:hasValue ?i .
  ?c2 owl:onProperty ?p2 .
  ?p1 rdfs:subPropertyOf ?p2 . }
=> { ?c1 rdfs:subClassOf ?c2 . } .

# scm-svf1
{ ?c1 owl:someValuesFrom ?y1 .
  ?c1 owl:onProperty ?p .
  ?c2 owl:someValuesFrom ?y2 .
  ?c2 owl:onProperty ?p .
  ?y1 rdfs:subClassOf ?y2 . }
=> { ?c1 rdfs:subClassOf ?c2 . } .

# scm-svf2
{ ?c1 owl:someValuesFrom ?y .
  ?c1 owl:onProperty ?p1 .
  ?c2 owl:someValuesFrom ?y .
  ?c2 owl:onProperty ?p2 .
  ?p1 rdfs:subPropertyOf ?p2 . }
=> { ?c1 rdfs:subClassOf ?c2 . } .

# scm-avf1
{ ?c1 owl:allValuesFrom ?y1 .
  ?c1 owl:onProperty ?p .
  ?c2 owl:allValuesFrom ?y2 .
  ?c2 owl:onProperty ?p .
  ?y1 rdfs:subClassOf ?y2 . }
=> { ?c1 rdfs:subClassOf ?c2 . } .

# scm-avf2
{ ?c1 owl:allValuesFrom ?y .
  ?c1 owl:onProperty ?p1 .
  ?c2 owl:allValuesFrom ?y .
  ?c2 owl:onProperty ?p2 .
  ?p1 rdfs:subPropertyOf ?p2 . }
=> { ?c2 rdfs:subClassOf ?c1 . } .

# scm-int
{ ?c owl:intersectionOf ?list .
  ?list list:member ?ci . }
=> { ?c rdfs:subClassOf ?ci . } .

# scm-uni
{ ?c owl:unionOf ?list .
  ?list list:member ?ci . }
=> { ?ci rdfs:subClassOf ?c . } .

#################################################################
# End of OWL 2 RL/RDF N3 ruleset
#################################################################

# Precomputed background facts and closure
<https://example.org/micro/Creature> <http://www.w3.org/2002/07/owl#equivalentClass> <https://schema.org/Agent> .
<https://example.org/micro/Human> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://schema.org/Agent> .
<https://example.org/micro/NonPerson> <http://www.w3.org/2002/07/owl#complementOf> <https://schema.org/Person> .
<https://example.org/micro/Organization> <http://www.w3.org/2002/07/owl#disjointWith> <https://schema.org/Person> .
<https://example.org/micro/User> <http://www.w3.org/2002/07/owl#hasKey> _:ndfd818e08cef4bd1a71fb63c73f770d6b1 .
<https://example.org/micro/alice> <https://example.org/micro/reportsTo> <https://example.org/micro/bob> .
<https://example.org/micro/bob> <https://example.org/micro/reportsTo> <https://example.org/micro/carol> .
<https://example.org/micro/directlyReportsTo> <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> <https://example.org/micro/reportsTo> .
<https://example.org/micro/employs> <http://www.w3.org/2002/07/owl#inverseOf> <https://example.org/micro/worksFor> .
<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Creature> .
<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Person> .
<https://example.org/micro/ethan> <https://example.org/micro/age> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .
<https://example.org/micro/ethan> <https://example.org/micro/directlyReportsTo> <https://example.org/micro/bob> .
<https://example.org/micro/ethan> <https://example.org/micro/knows> <https://example.org/micro/sandra> .
<https://example.org/micro/ethan> <https://example.org/micro/ssn> "123" .
<https://example.org/micro/ethan> <https://example.org/micro/ssn> "124" .
<https://example.org/micro/ethan> <https://example.org/micro/worksFor> <https://example.org/micro/wazoo> .
<https://example.org/micro/gregory> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Person> .
<https://example.org/micro/gregory> <https://schema.org/givenName> "Gregory" .
<https://example.org/micro/hasColleague> <http://www.w3.org/2002/07/owl#equivalentProperty> <https://example.org/micro/knows> .
<https://example.org/micro/memberOf> <http://www.w3.org/2002/07/owl#propertyChainAxiom> _:ndfd818e08cef4bd1a71fb63c73f770d6b2 .
<https://example.org/micro/reportsTo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#TransitiveProperty> .
<https://example.org/micro/ssn> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#FunctionalProperty> .
<https://example.org/micro/u1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/User> .
<https://example.org/micro/u1> <https://example.org/micro/email> "e@x" .
<https://example.org/micro/u2> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/User> .
<https://example.org/micro/u2> <https://example.org/micro/email> "e@x" .
<https://example.org/micro/wazoo> <https://example.org/micro/partOf> <https://example.org/micro/parentco> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#domain> <https://schema.org/Person> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#range> <https://example.org/micro/Organization> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/NonPerson> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Organization> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Person> .
<https://schema.org/Person> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://example.org/micro/Human> .
_:ndfd818e08cef4bd1a71fb63c73f770d6b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> <https://example.org/micro/email> .
_:ndfd818e08cef4bd1a71fb63c73f770d6b1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .
_:ndfd818e08cef4bd1a71fb63c73f770d6b2 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> <https://example.org/micro/worksFor> .
_:ndfd818e08cef4bd1a71fb63c73f770d6b2 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> _:ndfd818e08cef4bd1a71fb63c73f770d6b3 .
_:ndfd818e08cef4bd1a71fb63c73f770d6b3 <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> <https://example.org/micro/partOf> .
_:ndfd818e08cef4bd1a71fb63c73f770d6b3 <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Class> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term3> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term4> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term5> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#listRoot> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#intersectionListRoot> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#longIntersectionListRoot> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#keyListRoot> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#propertyChainRoot> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#listPair> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#left> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#right> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#allListClassTypes> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#sameValuesForProperties> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#propertyChainHolds> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#pathChain> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#pathSubject> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#pathObject> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#term> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#canonicalLiteral> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#complement> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<https://www.pieter.pm/rdfjs-inference-engine/ns/internal#literal> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/1999/02/22-rdf-syntax-ns#Property> .
<http://www.w3.org/2002/07/owl#sameAs> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#ReflexiveProperty> .
<http://www.w3.org/2002/07/owl#differentFrom> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#SymmetricProperty> .
<http://www.w3.org/2002/07/owl#NamedIndividual> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .
<http://www.w3.org/2002/07/owl#NamedIndividual> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/1999/02/22-rdf-syntax-ns#PlainLiteral> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2000/01/rdf-schema#Literal> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#decimal> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#nonNegativeInteger> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#nonPositiveInteger> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#positiveInteger> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#negativeInteger> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#long> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#int> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#short> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#byte> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#unsignedLong> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#unsignedInt> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#unsignedShort> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#float> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#double> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#string> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#normalizedString> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#token> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#language> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#Name> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#NCName> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#NMTOKEN> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#hexBinary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#base64Binary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#anyURI> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#dateTime> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#dateTimeStamp> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Datatype> .
<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#long> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#int> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#long> .
<http://www.w3.org/2001/XMLSchema#short> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#int> .
<http://www.w3.org/2001/XMLSchema#byte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#short> .
<http://www.w3.org/2001/XMLSchema#nonPositiveInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#negativeInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#nonPositiveInteger> .
<http://www.w3.org/2001/XMLSchema#nonNegativeInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#positiveInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .
<http://www.w3.org/2001/XMLSchema#unsignedLong> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .
<http://www.w3.org/2001/XMLSchema#unsignedInt> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#unsignedLong> .
<http://www.w3.org/2001/XMLSchema#unsignedShort> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#unsignedInt> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#unsignedShort> .
<http://www.w3.org/2001/XMLSchema#dateTimeStamp> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#dateTime> .
<http://www.w3.org/2001/XMLSchema#normalizedString> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#string> .
<http://www.w3.org/2001/XMLSchema#token> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#normalizedString> .
<http://www.w3.org/2001/XMLSchema#language> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#token> .
<http://www.w3.org/2001/XMLSchema#Name> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#token> .
<http://www.w3.org/2001/XMLSchema#NCName> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#Name> .
<http://www.w3.org/2001/XMLSchema#NMTOKEN> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#token> .
<http://www.w3.org/2000/01/rdf-schema#label> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2000/01/rdf-schema#comment> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2000/01/rdf-schema#seeAlso> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2000/01/rdf-schema#isDefinedBy> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2002/07/owl#deprecated> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2002/07/owl#versionInfo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2002/07/owl#priorVersion> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2002/07/owl#backwardCompatibleWith> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2002/07/owl#incompatibleWith> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#AnnotationProperty> .
<http://www.w3.org/2002/07/owl#Thing> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .
<http://www.w3.org/2002/07/owl#NamedIndividual> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#NamedIndividual> .
<http://www.w3.org/2002/07/owl#NamedIndividual> <http://www.w3.org/2002/07/owl#equivalentClass> <http://www.w3.org/2002/07/owl#NamedIndividual> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#NamedIndividual> .
<http://www.w3.org/2002/07/owl#Thing> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2002/07/owl#Thing> <http://www.w3.org/2002/07/owl#equivalentClass> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Nothing> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/2002/07/owl#equivalentClass> <http://www.w3.org/2002/07/owl#Nothing> .
<https://example.org/micro/Creature> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://schema.org/Agent> .
<https://schema.org/Agent> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://example.org/micro/Creature> .
<https://example.org/micro/hasColleague> <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> <https://example.org/micro/knows> .
<https://example.org/micro/knows> <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> <https://example.org/micro/hasColleague> .
<https://eyereasoner.github.io/.well-known/genid/b38f6a60-6fa1-aa5e-8a36-0b389e043fe8> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#left> <https://example.org/micro/worksFor> .
<https://eyereasoner.github.io/.well-known/genid/b38f6a60-6fa1-aa5e-8a36-0b389e043fe8> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#right> <https://example.org/micro/partOf> .
<https://eyereasoner.github.io/.well-known/genid/73ad396c-82a5-b6c0-857e-bad4387cf858> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#sameValuesForProperties> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<https://eyereasoner.github.io/.well-known/genid/ba44ad1c-1531-901e-f604-75a41a0eeae4> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#sameValuesForProperties> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<https://eyereasoner.github.io/.well-known/genid/a5279567-990f-eb80-1322-ce346a4afdfc> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#sameValuesForProperties> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<https://eyereasoner.github.io/.well-known/genid/a18db400-6335-3a04-f2bb-aa00dfed06b4> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#sameValuesForProperties> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<https://example.org/micro/wazoo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Organization> .
"123" <http://www.w3.org/2002/07/owl#sameAs> "123" .
"123" <http://www.w3.org/2002/07/owl#sameAs> "124" .
"124" <http://www.w3.org/2002/07/owl#sameAs> "123" .
"124" <http://www.w3.org/2002/07/owl#sameAs> "124" .
<https://example.org/micro/alice> <https://example.org/micro/reportsTo> <https://example.org/micro/carol> .
<https://example.org/micro/ethan> <https://example.org/micro/reportsTo> <https://example.org/micro/bob> .
<https://example.org/micro/ethan> <https://example.org/micro/hasColleague> <https://example.org/micro/sandra> .
<https://example.org/micro/ethan> <https://example.org/micro/memberOf> <https://example.org/micro/parentco> .
<https://example.org/micro/wazoo> <https://example.org/micro/employs> <https://example.org/micro/ethan> .
<https://example.org/micro/u1> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/u1> .
<https://example.org/micro/u1> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/u2> .
<https://example.org/micro/u2> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/u1> .
<https://example.org/micro/u2> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/u2> .
<https://eyereasoner.github.io/.well-known/genid/20433a9f-ab1a-35fa-34e0-30f50896ebf8> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/20433a9f-ab1a-35fa-34e0-30f50896ebf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#cls-com> .
<https://eyereasoner.github.io/.well-known/genid/20433a9f-ab1a-35fa-34e0-30f50896ebf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> <https://example.org/micro/NonPerson> .
<https://eyereasoner.github.io/.well-known/genid/20433a9f-ab1a-35fa-34e0-30f50896ebf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> <https://schema.org/Person> .
<https://eyereasoner.github.io/.well-known/genid/20433a9f-ab1a-35fa-34e0-30f50896ebf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term3> <https://example.org/micro/zeus> .
<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Human> .
<https://example.org/micro/gregory> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Human> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Human> .
<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Agent> .
<https://eyereasoner.github.io/.well-known/genid/6d32d037-7939-756a-f2f5-7dc684308cf8> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/6d32d037-7939-756a-f2f5-7dc684308cf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#cax-dw> .
<https://eyereasoner.github.io/.well-known/genid/6d32d037-7939-756a-f2f5-7dc684308cf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> <https://example.org/micro/Organization> .
<https://eyereasoner.github.io/.well-known/genid/6d32d037-7939-756a-f2f5-7dc684308cf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> <https://schema.org/Person> .
<https://eyereasoner.github.io/.well-known/genid/6d32d037-7939-756a-f2f5-7dc684308cf8> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term3> <https://example.org/micro/zeus> .
<https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .
<https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> <http://www.w3.org/2002/07/owl#complementOf> <https://schema.org/Person> .
<https://example.org/micro/Organization> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> .
<https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> <http://www.w3.org/2002/07/owl#complementOf> <https://example.org/micro/Organization> .
<https://schema.org/Person> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://eyereasoner.github.io/.well-known/genid/9a65ed34-4463-6152-8eea-cc33e1a49784> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#term> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .
<https://eyereasoner.github.io/.well-known/genid/d39a1a18-3c74-c478-9943-27c41f5a69e0> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#term> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
"123" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#string> .
"123" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Literal> .
"124" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#string> .
"124" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Literal> .
"Gregory" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#string> .
"Gregory" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Literal> .
"e@x" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#string> .
"e@x" <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Literal> .
"123" <http://www.w3.org/2002/07/owl#differentFrom> "123" .
"123" <http://www.w3.org/2002/07/owl#differentFrom> "124" .
"124" <http://www.w3.org/2002/07/owl#differentFrom> "123" .
"124" <http://www.w3.org/2002/07/owl#differentFrom> "124" .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#integer> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#boolean> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Literal> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#decimal> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#positiveInteger> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#long> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#int> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#short> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#byte> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#unsignedLong> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#unsignedInt> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#unsignedShort> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#unsignedByte> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#float> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#double> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#string> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#normalizedString> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#token> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#NMTOKEN> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#hexBinary> .
"42"^^<http://www.w3.org/2001/XMLSchema#integer> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#anyURI> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2000/01/rdf-schema#Literal> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#string> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#normalizedString> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#token> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#language> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#Name> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#NCName> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#NMTOKEN> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#base64Binary> .
"true"^^<http://www.w3.org/2001/XMLSchema#boolean> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2001/XMLSchema#anyURI> .
<https://eyereasoner.github.io/.well-known/genid/9a65ed34-4463-6152-8eea-cc33e1a49784> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#canonicalLiteral> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .
<https://eyereasoner.github.io/.well-known/genid/d39a1a18-3c74-c478-9943-27c41f5a69e0> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#canonicalLiteral> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<http://www.w3.org/2001/XMLSchema#long> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#int> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#short> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#long> .
<http://www.w3.org/2001/XMLSchema#byte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#int> .
<http://www.w3.org/2001/XMLSchema#nonPositiveInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#negativeInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#nonNegativeInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#positiveInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#unsignedLong> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#unsignedInt> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .
<http://www.w3.org/2001/XMLSchema#unsignedShort> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#unsignedLong> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#unsignedInt> .
<http://www.w3.org/2001/XMLSchema#token> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#string> .
<http://www.w3.org/2001/XMLSchema#language> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#normalizedString> .
<http://www.w3.org/2001/XMLSchema#Name> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#normalizedString> .
<http://www.w3.org/2001/XMLSchema#NCName> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#token> .
<http://www.w3.org/2001/XMLSchema#NMTOKEN> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#normalizedString> .
<https://example.org/micro/Human> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://example.org/micro/Creature> .
<https://schema.org/Person> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://schema.org/Agent> .
<https://example.org/micro/Creature> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://example.org/micro/Creature> .
<https://schema.org/Agent> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://schema.org/Agent> .
<https://schema.org/Agent> <http://www.w3.org/2002/07/owl#equivalentClass> <https://example.org/micro/Creature> .
<https://example.org/micro/Creature> <http://www.w3.org/2002/07/owl#equivalentClass> <https://example.org/micro/Creature> .
<https://schema.org/Agent> <http://www.w3.org/2002/07/owl#equivalentClass> <https://schema.org/Agent> .
<https://example.org/micro/hasColleague> <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> <https://example.org/micro/hasColleague> .
<https://example.org/micro/knows> <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> <https://example.org/micro/knows> .
<https://example.org/micro/knows> <http://www.w3.org/2002/07/owl#equivalentProperty> <https://example.org/micro/hasColleague> .
<https://example.org/micro/hasColleague> <http://www.w3.org/2002/07/owl#equivalentProperty> <https://example.org/micro/hasColleague> .
<https://example.org/micro/knows> <http://www.w3.org/2002/07/owl#equivalentProperty> <https://example.org/micro/knows> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#domain> <https://example.org/micro/Human> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#domain> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#domain> <https://schema.org/Agent> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#range> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> <http://www.w3.org/2002/07/owl#equivalentClass> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> <http://www.w3.org/2002/07/owl#equivalentClass> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2002/07/owl#Nothing> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://eyereasoner.github.io/.well-known/genid/23bca101-7c1b-95e8-82b4-e058b3b17b74> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/23bca101-7c1b-95e8-82b4-e058b3b17b74> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#eq-diff1> .
<https://eyereasoner.github.io/.well-known/genid/23bca101-7c1b-95e8-82b4-e058b3b17b74> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "123" .
<https://eyereasoner.github.io/.well-known/genid/23bca101-7c1b-95e8-82b4-e058b3b17b74> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "123" .
<https://eyereasoner.github.io/.well-known/genid/fd058080-bb3f-d894-53b2-a646d3294f48> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/fd058080-bb3f-d894-53b2-a646d3294f48> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#eq-diff1> .
<https://eyereasoner.github.io/.well-known/genid/fd058080-bb3f-d894-53b2-a646d3294f48> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "123" .
<https://eyereasoner.github.io/.well-known/genid/fd058080-bb3f-d894-53b2-a646d3294f48> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "124" .
<https://eyereasoner.github.io/.well-known/genid/1307fd87-acd7-4d56-6656-2f18f6ae55a0> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/1307fd87-acd7-4d56-6656-2f18f6ae55a0> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#eq-diff1> .
<https://eyereasoner.github.io/.well-known/genid/1307fd87-acd7-4d56-6656-2f18f6ae55a0> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "124" .
<https://eyereasoner.github.io/.well-known/genid/1307fd87-acd7-4d56-6656-2f18f6ae55a0> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "123" .
<https://eyereasoner.github.io/.well-known/genid/142f2f60-5429-2b72-23a0-1820d723d952> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/142f2f60-5429-2b72-23a0-1820d723d952> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#eq-diff1> .
<https://eyereasoner.github.io/.well-known/genid/142f2f60-5429-2b72-23a0-1820d723d952> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "124" .
<https://eyereasoner.github.io/.well-known/genid/142f2f60-5429-2b72-23a0-1820d723d952> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "124" .
<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://example.org/micro/wazoo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://example.org/micro/ethan> <https://example.org/micro/reportsTo> <https://example.org/micro/carol> .
<https://example.org/micro/ethan> <http://www.w3.org/2002/07/owl#differentFrom> <https://example.org/micro/ethan> .
<https://example.org/micro/gregory> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Agent> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://schema.org/Agent> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://example.org/micro/gregory> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://example.org/micro/gregory> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Creature> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/micro/Creature> .
<https://example.org/micro/wazoo> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Thing> .
<https://example.org/micro/ethan> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Thing> .
<https://eyereasoner.github.io/.well-known/genid/d69f4c1f-f38f-04d4-5c0a-725184ed5128> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#term> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<https://eyereasoner.github.io/.well-known/genid/d69f4c1f-f38f-04d4-5c0a-725184ed5128> <https://www.pieter.pm/rdfjs-inference-engine/ns/internal#canonicalLiteral> "true"^^<http://www.w3.org/2001/XMLSchema#boolean> .
<http://www.w3.org/2001/XMLSchema#int> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#short> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#byte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#long> .
<http://www.w3.org/2001/XMLSchema#negativeInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#positiveInteger> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#unsignedLong> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#unsignedInt> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#unsignedShort> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#unsignedLong> .
<http://www.w3.org/2001/XMLSchema#language> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#string> .
<http://www.w3.org/2001/XMLSchema#Name> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#string> .
<http://www.w3.org/2001/XMLSchema#NCName> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#normalizedString> .
<http://www.w3.org/2001/XMLSchema#NMTOKEN> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#string> .
<https://schema.org/Person> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <https://example.org/micro/Creature> .
<https://example.org/micro/Organization> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<https://schema.org/Person> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2001/XMLSchema#short> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#byte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#unsignedInt> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#unsignedShort> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#nonNegativeInteger> .
<http://www.w3.org/2001/XMLSchema#NCName> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#string> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#domain> <https://example.org/micro/Creature> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#domain> <http://www.w3.org/2002/07/owl#Thing> .
<https://example.org/micro/worksFor> <http://www.w3.org/2000/01/rdf-schema#range> <http://www.w3.org/2002/07/owl#Thing> .
<https://example.org/micro/ethan> <http://www.w3.org/2002/07/owl#sameAs> <https://example.org/micro/ethan> .
<https://eyereasoner.github.io/.well-known/genid/23bca101-7c1b-95e8-82b4-e058b3b17b74> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "124" .
<https://eyereasoner.github.io/.well-known/genid/23bca101-7c1b-95e8-82b4-e058b3b17b74> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "124" .
<https://eyereasoner.github.io/.well-known/genid/fd058080-bb3f-d894-53b2-a646d3294f48> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "124" .
<https://eyereasoner.github.io/.well-known/genid/1307fd87-acd7-4d56-6656-2f18f6ae55a0> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "124" .
<https://eyereasoner.github.io/.well-known/genid/fd058080-bb3f-d894-53b2-a646d3294f48> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "123" .
<https://eyereasoner.github.io/.well-known/genid/1307fd87-acd7-4d56-6656-2f18f6ae55a0> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "123" .
<https://eyereasoner.github.io/.well-known/genid/142f2f60-5429-2b72-23a0-1820d723d952> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> "123" .
<https://eyereasoner.github.io/.well-known/genid/142f2f60-5429-2b72-23a0-1820d723d952> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> "123" .
<https://eyereasoner.github.io/.well-known/genid/ccea2218-3dcd-9188-88a0-3e8ec2b54e4c> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/ccea2218-3dcd-9188-88a0-3e8ec2b54e4c> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#eq-diff1> .
<https://eyereasoner.github.io/.well-known/genid/ccea2218-3dcd-9188-88a0-3e8ec2b54e4c> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> <https://example.org/micro/ethan> .
<https://eyereasoner.github.io/.well-known/genid/ccea2218-3dcd-9188-88a0-3e8ec2b54e4c> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> <https://example.org/micro/ethan> .
<https://eyereasoner.github.io/.well-known/genid/6a9e8883-d63f-5b0a-6288-90c8f57946e4> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/6a9e8883-d63f-5b0a-6288-90c8f57946e4> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#cls-com> .
<https://eyereasoner.github.io/.well-known/genid/6a9e8883-d63f-5b0a-6288-90c8f57946e4> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> <https://eyereasoner.github.io/.well-known/genid/b0b540ba-4aa4-3ac4-a208-6781c8fd9074> .
<https://eyereasoner.github.io/.well-known/genid/6a9e8883-d63f-5b0a-6288-90c8f57946e4> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> <https://schema.org/Person> .
<https://eyereasoner.github.io/.well-known/genid/6a9e8883-d63f-5b0a-6288-90c8f57946e4> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term3> <https://example.org/micro/zeus> .
<https://eyereasoner.github.io/.well-known/genid/a0dc49ac-ac27-a40a-5cf4-c89804e3cddc> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#Inconsistency> .
<https://eyereasoner.github.io/.well-known/genid/a0dc49ac-ac27-a40a-5cf4-c89804e3cddc> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#rule> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#cls-com> .
<https://eyereasoner.github.io/.well-known/genid/a0dc49ac-ac27-a40a-5cf4-c89804e3cddc> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term1> <https://eyereasoner.github.io/.well-known/genid/62f90407-e10c-7810-40a6-89950b4efe40> .
<https://eyereasoner.github.io/.well-known/genid/a0dc49ac-ac27-a40a-5cf4-c89804e3cddc> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term2> <https://example.org/micro/Organization> .
<https://eyereasoner.github.io/.well-known/genid/a0dc49ac-ac27-a40a-5cf4-c89804e3cddc> <https://www.pieter.pm/rdfjs-inference-engine/ns/inconsistencies#term3> <https://example.org/micro/zeus> .
<https://example.org/micro/zeus> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Thing> .
<https://example.org/micro/gregory> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Thing> .
<http://www.w3.org/2001/XMLSchema#byte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#unsignedShort> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#integer> .
<http://www.w3.org/2001/XMLSchema#unsignedByte> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://www.w3.org/2001/XMLSchema#decimal> .
`;
