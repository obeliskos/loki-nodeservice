# loki-nodeservice
Service layer for hosting loki databases

## Description
This project implements a service layer which can be used to host loki database instances and interoperate with them. 

## Requirements
To use this service layer, you need to implement an 'initializer' which are essentially loki database instance factories.  Additionally you should write code which calls the loki-nodeservice layer to insert/update/remove/find/transform etc.

## Multiple instances
This loki-nodeservice service layer can manage multiple database instances per initializer, as well as multiple initializers.  So there is no limit to the number or variety of databases which can be simulatenously 'spun up' except for your memory constraints since all databases must be kept in-memory.

## Interfaces
There will be two interfaces evolving for this service layer.  The first (already implemented) was designed for asp.net core node services.  This interface requires callbacks first and objects to be serialized.  An alternate, native node interface will be added which leaves array and object instances as they are and puts callbacks last in order.

## Example
For an example, see the examples folder.


