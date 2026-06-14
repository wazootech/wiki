---
type: sh:NodeShape
rdfs:label: SoftwareApplication Shape
rdfs:comment: Validation rules for software inventory items.
sh:targetClass: schema:SoftwareApplication
sh:property:
  - sh:path: schema:name
    sh:minCount: 1
    sh:datatype: xsd:string
  - sh:path: schema:softwareVersion
    sh:datatype: xsd:string
  - sh:path: schema:description
    sh:minCount: 1
    sh:datatype: xsd:string
---

# SoftwareApplication Validation Shape

This wiki document defines the structure and requirements for documents describing software binaries and tool suites.
