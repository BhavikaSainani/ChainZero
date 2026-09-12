"""
Multi-tier propagation over the supplier graph.

Deep-tier emissions are attributed upward through explicit allocation
shares (a child can feed more than one parent; each parent gets the share
of the child's total that its edge specifies). Built on NetworkX so the
propagation order is a genuine topological sort rather than assumed
tier ordering - it still works if a supplier sources from a peer tier.
"""

import networkx as nx


def build_graph(edges):
    """edges: iterable of {"from": child_id, "to": parent_id, "share": float}"""
    g = nx.DiGraph()
    for e in edges:
        g.add_edge(e["from"], e["to"], share=float(e["share"]))
    return g


def rollup_all(direct_kgco2e_by_id, edges, root="FOCAL"):
    """Returns {supplier_id: rolled_up_kgco2e} for every node reachable
    into `root`, where rolled_up = own direct + sum(child_rolled_up * share)
    for every edge child->this_node. Computed via reverse topological order
    (leaves first) so every child is resolved before its parents need it."""
    g = build_graph(edges)
    for node in direct_kgco2e_by_id:
        if node not in g:
            g.add_node(node)

    order = list(nx.topological_sort(g))  # parents-before-children is wrong;
    # topological_sort on edges child->parent yields children before parents
    # only if there are no cycles - supply chains are a DAG by construction.

    rolled = {}
    for node in order:
        total = direct_kgco2e_by_id.get(node, 0.0)
        for child, _, data in g.in_edges(node, data=True):
            total += rolled.get(child, direct_kgco2e_by_id.get(child, 0.0)) * data["share"]
        rolled[node] = total

    return rolled
