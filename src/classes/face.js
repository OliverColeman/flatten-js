/**
 * Created by Alex Bol on 3/17/2017.
 */


"use strict";

import Flatten from '../flatten';

let {Point, point, Segment, segment, Arc, Box, Edge, Circle} = Flatten;

/**
 * Class representing a face (closed loop) in a [polygon]{@link Flatten.Polygon} object.
 * Face is a circular bidirectional linked list of [edges]{@link Flatten.Edge}.
 * Face object cannot be instantiated with a constructor.
 * Instead, use [polygon.addFace()]{@link Flatten.Polygon#addFace} method.
 * <br/>
 * Note, that face only set entry point to the linked list of edges but does not contain edges by itself.
 * Container of edges is a property of the polygon object. <br/>
 *
 * @example
 * // Face implements "next" iterator which enables to iterate edges in for loop:
 * for (let edge of face) {
 *      console.log(edge.shape.length)     // do something
 * }
 *
 * // Instead, it is possible to iterate edges as linked list, starting from face.first:
 * let edge = face.first;
 * do {
 *   console.log(edge.shape.length);   // do something
 *   edge = edge.next;
 * } while (edge != face.first)
 */
class Face {
    constructor(polygon, ...args) {
        /**
         * Reference to the first edge in face
         */
        this.first;
        /**
         * Reference to the last edge in face
         */
        this.last;

        this._box = undefined;  // new Box();
        this._orientation = undefined;

        if (args.length == 0) {
            return;
        }

        /* If passed an array it supposed to be:
         1) array of shapes that performs close loop or
         2) array of points that performs set of vertices
         */
        if (args.length == 1) {
            if (args[0] instanceof Array) {
                // let argsArray = args[0];
                let shapes = args[0];  // argsArray[0];
                if (shapes.length == 0)
                    return;

                if (shapes.every((shape) => {
                    return shape instanceof Point
                })) {
                    let segments = Face.points2segments(shapes);
                    this.shapes2face(polygon.edges, segments);
                } else if (shapes.every((shape) => {
                    return (shape instanceof Segment || shape instanceof Arc)
                })) {
                    this.shapes2face(polygon.edges, shapes);
                }
                // this is from JSON.parse object
                else if (shapes.every((shape) => {
                    return (shape.name === "segment" || shape.name === "arc")
                })) {
                    let flattenShapes = [];
                    for (let shape of shapes) {
                        let flattenShape;
                        if (shape.name === "segment") {
                            flattenShape = new Segment(shape);
                        } else {
                            flattenShape = new Arc(shape);
                        }
                        flattenShapes.push(flattenShape);
                    }
                    this.shapes2face(polygon.edges, flattenShapes);
                }
            }
            /* Create new face and copy edges into polygon.edges set */
            else if (args[0] instanceof Face) {
                let face = args[0];
                this.first = face.first;
                this.last = face.last;
                for (let edge of face) {
                    polygon.edges.add(edge);
                }
            }
            /* Instantiate face from circle circle in CCW orientation */
            else if (args[0] instanceof Circle) {
                this.shapes2face(polygon.edges, [args[0].toArc(Flatten.CCW)]);
            }
            /* Instantiate face from a box in CCW orientation */
            else if (args[0] instanceof Box) {
                let box = args[0];
                this.shapes2face(polygon.edges, [
                    segment(point(box.xmin, box.ymin), point(box.xmax, box.ymin)),
                    segment(point(box.xmax, box.ymin), point(box.xmax, box.ymax)),
                    segment(point(box.xmax, box.ymax), point(box.xmin, box.ymax)),
                    segment(point(box.xmin, box.ymax), point(box.xmin, box.ymin))
                ]);
            }
        }
        /* If passed two edges, consider them as start and end of the face loop */
        /* THIS METHOD WILL BE USED BY BOOLEAN OPERATIONS */
        /* Assume that edges already copied to polygon.edges set in the clip algorithm !!! */
        if (args.length == 2 && args[0] instanceof Edge && args[1] instanceof Edge) {
            this.first = args[0];                          // first edge in face or undefined
            this.last = args[1];                           // last edge in face or undefined
            this.last.next = this.first;
            this.first.prev = this.last;

            // set arc length
            this.setArcLength();
            /*
             let edge = this.first;
             edge.arc_length = 0;
             edge = edge.next;
             while (edge !== this.first) {
             edge.arc_length = edge.prev.arc_length + edge.prev.length;
             edge = edge.next;
             }
             */

            // this.box = this.getBox();
            // this.orientation = this.getOrientation();      // face direction cw or ccw
        }
    }

    [Symbol.iterator]() {
        let edge = undefined;
        return {
            next: () => {
                let value = edge ? edge : this.first;
                let done = this.first ? (edge ? edge === this.first : false) : true;
                edge = value ? value.next : undefined;
                return {value: value, done: done};
            }
        };
    };

    /**
     * Return array of edges from first to last
     * @returns {Array}
     */
    get edges() {
        let face_edges = [];
        for (let edge of this) {
            face_edges.push(edge);
        }
        return face_edges;
    }

    /**
     * Return number of edges in the face
     * @returns {number}
     */
    get size() {
        let counter = 0;
        for (let edge of this) {
            counter++;
        }
        return counter;
    }

    /**
     * Return bounding box of the face
     * @returns {Box}
     */
    get box() {
        if (this._box === undefined) {
            let box = new Flatten.Box();
            for (let edge of this) {
                box = box.merge(edge.box);
            }
            this._box = box;
        }
        return this._box;
    }

    static points2segments(points) {
        let segments = [];
        for (let i = 0; i < points.length; i++) {
            segments.push(new Segment(points[i], points[(i + 1) % points.length]));
        }
        return segments;
    }

    shapes2face(edges, shapes) {
        for (let shape of shapes) {
            let edge = new Edge(shape);
            this.append(edges, edge);
            // this.box = this.box.merge(shape.box);
            // edges.add(edge);
        }
        // this.orientation = this.getOrientation();              // face direction cw or ccw
    }

    /**
     * Returns true if face is empty, false otherwise
     * @returns {boolean}
     */
    isEmpty() {
        return (this.first === undefined && this.last === undefined)
    }

    /**
     * Append given edge after the last edge (and before the first edge). <br/>
     * This method mutates current object and does not return any value
     * @param {PlanarSet} edges - Container of edges
     * @param {Edge} edge - Edge to be appended to the linked list
     */
    append(edges, edge) {
        if (this.first === undefined) {
            edge.prev = edge;
            edge.next = edge;
            this.first = edge;
            this.last = edge;
            edge.arc_length = 0;
        } else {
            // append to end
            edge.prev = this.last;
            this.last.next = edge;

            // update edge to be last
            this.last = edge;

            // restore circular links
            this.last.next = this.first;
            this.first.prev = this.last;

            // set arc length
            edge.arc_length = edge.prev.arc_length + edge.prev.length;
        }
        edge.face = this;

        edges.add(edge);      // Add new edges into edges container
    }

    /**
     * Insert edge newEdge into the linked list after the edge edgeBefore <br/>
     * This method mutates current object and does not return any value
     * @param {PlanarSet} edges - Container of edges
     * @param {Edge} newEdge - Edge to be inserted into linked list
     * @param {Edge} edgeBefore - Edge to insert newEdge after it
     */
    insert(edges, newEdge, edgeBefore) {
        if (this.first === undefined) {
            newEdge.prev = newEdge;
            newEdge.next = newEdge;
            this.first = newEdge;
            this.last = newEdge;
        } else {
            /* set links to new edge */
            let edgeAfter = edgeBefore.next;
            edgeBefore.next = newEdge;
            edgeAfter.prev = newEdge;

            /* set links from new edge */
            newEdge.prev = edgeBefore;
            newEdge.next = edgeAfter;

            /* extend chain if new edge added after last edge */
            if (this.last === edgeBefore)
                this.first = newEdge;
        }
        newEdge.face = this;

        // set arc length
        if (newEdge.prev === this.last) {
            newEdge.arc_length = 0;
        } else {
            newEdge.arc_length = newEdge.prev.arc_length + newEdge.prev.length;
        }

        edges.add(newEdge);      // Add new edges into edges container
    }

    /**
     * Remove the given edge from the linked list of the face <br/>
     * This method mutates current object and does not return any value
     * @param {PlanarSet} edges - Container of edges
     * @param {Edge} edge - Edge to be removed
     */
    remove(edges, edge) {
        // special case if last edge removed
        if (edge === this.first && edge === this.last) {
            this.first = undefined;
            this.last = undefined;
        } else {
            // update linked list
            edge.prev.next = edge.next;
            edge.next.prev = edge.prev;
            // update first if need
            if (edge === this.first) {
                this.first = edge.next;
            }
            // update last if need
            if (edge === this.last) {
                this.last = edge.prev;
            }
        }
        edges.delete(edge);      // delete from PlanarSet of edges and update index
    }

    /**
     * Reverse orientation of the face: first edge become last and vice a verse,
     * all edges starts and ends swapped, direction of arcs inverted.
     */
    reverse() {
        // collect edges in revert order with reverted shapes
        let edges = [];
        let edge_tmp = this.last;
        do {
            // reverse shape
            edge_tmp.shape = edge_tmp.shape.reverse();
            edges.push(edge_tmp);
            edge_tmp = edge_tmp.prev;
        } while (edge_tmp !== this.last);

        // restore linked list
        this.first = undefined;
        this.last = undefined;
        for (let edge of edges) {
            if (this.first === undefined) {
                edge.prev = edge;
                edge.next = edge;
                this.first = edge;
                this.last = edge;
                edge.arc_length = 0;
            } else {
                // append to end
                edge.prev = this.last;
                this.last.next = edge;

                // update edge to be last
                this.last = edge;

                // restore circular links
                this.last.next = this.first;
                this.first.prev = this.last;

                // set arc length
                edge.arc_length = edge.prev.arc_length + edge.prev.length;
            }
        }

        // Recalculate orientation, if set
        if (this._orientation !== undefined) {
            this._orientation = undefined;
            this._orientation = this.orientation();
        }
    }


    /**
     * Set arc_length property for each of the edges in the face.
     * Arc_length of the edge it the arc length from the first edge of the face
     */
    setArcLength() {
        for (let edge of this) {
            if (edge === this.first) {
                edge.arc_length = 0.0;
            } else {
                edge.arc_length = edge.prev.arc_length + edge.prev.length;
            }
            edge.face = this;
        }
    }

    /**
     * Returns the absolute value of the area of the face
     * @returns {number}
     */
    area() {
        return Math.abs(this.signedArea());
    }

    /**
     * Returns signed area of the simple face.
     * Face is simple if it has no self intersections that change its orientation.
     * Then the area will be positive if the orientation of the face is clockwise,
     * and negative if orientation is counterclockwise.
     * It may be zero if polygon is degenerated.
     * @returns {number}
     */
    signedArea() {
        let sArea = 0;
        let ymin = this.box.ymin;
        for (let edge of this) {
            sArea += edge.shape.definiteIntegral(ymin);
        }
        return sArea;
    }

    /**
     * Return face orientation: one of Flatten.ORIENTATION.CCW, Flatten.ORIENTATION.CW, Flatten.ORIENTATION.NOT_ORIENTABLE <br/>
     * According to Green theorem the area of a closed curve may be calculated as double integral,
     * and the sign of the integral will be defined by the direction of the curve.
     * When the integral ("signed area") will be negative, direction is counter clockwise,
     * when positive - clockwise and when it is zero, polygon is not orientable.
     * See {@link https://mathinsight.org/greens_theorem_find_area}
     * @returns {number}
     */
    orientation() {
        if (this._orientation === undefined) {
            let area = this.signedArea();
            if (Flatten.Utils.EQ_0(area)) {
                this._orientation = Flatten.ORIENTATION.NOT_ORIENTABLE;
            } else if (Flatten.Utils.LT(area, 0)) {
                this._orientation = Flatten.ORIENTATION.CCW;
            } else {
                this._orientation = Flatten.ORIENTATION.CW;
            }
        }
        return this._orientation;
    }

    /**
     * Returns true if face of the polygon is simple (no self-intersection points found)
     * NOTE: this method is incomplete because it doe not exclude touching points
     * Real self intersection inverts orientation of the polygon.
     * But this is also good enough for the demonstration of the idea
     * @param {Edges} edges - reference to polygon.edges to provide search index
     * @returns {boolean}
     */
    isSimple(edges) {
        let ip = Face.getSelfIntersections(this, edges, true);
        return ip.length == 0;
    }

    static getSelfIntersections(face, edges, exitOnFirst = false) {
        let int_points = [];

        // calculate intersections
        for (let edge1 of face) {

            // request edges of polygon in the box of edge1
            let resp = edges.search(edge1.box);

            // for each edge2 in response
            for (let edge2 of resp) {

                // Skip itself
                if (edge1 === edge2)
                    continue;

                // Skip next and previous edge if both are segment (if one of them arc - calc intersection)
                if (edge1.shape instanceof Flatten.Segment && edge2.shape instanceof Flatten.Segment &&
                    (edge1.next === edge2 || edge1.prev === edge2))
                    continue;

                // calculate intersections between edge1 and edge2
                let ip = edge1.shape.intersect(edge2.shape);

                // for each intersection point
                for (let pt of ip) {

                    // skip start-end connections
                    if (pt.equalTo(edge1.start) && pt.equalTo(edge2.end) && edge2 === edge1.prev)
                        continue;
                    if (pt.equalTo(edge1.end) && pt.equalTo(edge2.start) && edge2 === edge1.next)
                        continue;

                    int_points.push(pt);

                    if (exitOnFirst)
                        break;
                }

                if (int_points.length > 0 && exitOnFirst)
                    break;
            }

            if (int_points.length > 0 && exitOnFirst)
                break;

        }
        return int_points;
    }

    toJSON() {
        return this.edges.map(edge => edge.toJSON());
    }

    /**
     * Returns string to be assigned to "d" attribute inside defined "path"
     * @returns {string}
     */
    svg() {
        let svgStr = `\nM${this.first.start.x},${this.first.start.y}`;
        for (let edge of this) {
            svgStr += edge.svg();
        }
        svgStr += ` z`;
        return svgStr;
    }

};