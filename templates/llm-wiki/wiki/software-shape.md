---
id: schema:SoftwareApplicationShape
type: sh:NodeShape
name: SoftwareApplication Shape
description: Validation rules for software inventory items.
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

# SoftwareApplication validation shape

This wiki document defines the structure and requirements for documents describing software binaries and tool suites.
