---
type: sh:NodeShape
label: SoftwareApplication Shape
comment: Validation rules for software inventory items.
sh:targetClass: schema:SoftwareApplication
sh:property:
  - sh:path: rdfs:label
    sh:minCount: 1
    sh:datatype: xsd:string
  - sh:path: schema:softwareVersion
    sh:datatype: xsd:string
  - sh:path: rdfs:comment
    sh:minCount: 1
    sh:datatype: xsd:string
---

# SoftwareApplication validation shape

This wiki document defines the structure and requirements for documents describing software binaries and tool suites.
