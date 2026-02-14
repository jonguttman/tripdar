/**
 * Lineage Service
 *
 * Provides lineage tree traversal and relationship discovery
 * for strain genetic relationships.
 */

import { getAllStrains } from "@/domain/strain/data";
import type { InternalStrain } from "@/domain/strain/data";

// =============================================================================
// Types
// =============================================================================

export interface LineageNode {
  id: string;
  name: string;
  potency: string;
  generation: number;
  parents: LineageNode[];
  children: string[]; // Just IDs to avoid circular refs
  lineageNotes?: string;
}

export interface LineageTreeResponse {
  roots: LineageNode[];
  totalStrains: number;
  maxGeneration: number;
}

export interface LineagePathResponse {
  path: { id: string; name: string; generation: number }[];
  relationship: string;
  distance: number;
}

// =============================================================================
// Tree Building
// =============================================================================

/**
 * Build the full lineage tree from root strains
 */
export function buildFullTree(): LineageTreeResponse {
  const strains = getAllStrains();
  const strainMap = new Map(strains.map(s => [s.id, s]));

  // Find all children for each strain
  const childrenMap = new Map<string, string[]>();
  for (const strain of strains) {
    if (strain.parentStrains) {
      for (const parentId of strain.parentStrains) {
        const existing = childrenMap.get(parentId) || [];
        existing.push(strain.id);
        childrenMap.set(parentId, existing);
      }
    }
  }

  // Find root strains (no parents or generation 0)
  const roots = strains.filter(s =>
    s.generation === 0 || !s.parentStrains || s.parentStrains.length === 0
  );

  // Build tree nodes recursively
  const buildNode = (strain: InternalStrain, visited: Set<string> = new Set()): LineageNode => {
    if (visited.has(strain.id)) {
      // Prevent infinite loops
      return {
        id: strain.id,
        name: strain.name,
        potency: strain.potency,
        generation: strain.generation ?? 0,
        parents: [],
        children: [],
        lineageNotes: strain.lineageNotes,
      };
    }

    visited.add(strain.id);

    const parents: LineageNode[] = [];
    if (strain.parentStrains) {
      for (const parentId of strain.parentStrains) {
        const parent = strainMap.get(parentId);
        if (parent) {
          parents.push(buildNode(parent, new Set(visited)));
        }
      }
    }

    return {
      id: strain.id,
      name: strain.name,
      potency: strain.potency,
      generation: strain.generation ?? 0,
      parents,
      children: childrenMap.get(strain.id) || [],
      lineageNotes: strain.lineageNotes,
    };
  };

  const rootNodes = roots.map(r => buildNode(r));

  // Find max generation
  let maxGeneration = 0;
  for (const strain of strains) {
    if (strain.generation !== undefined && strain.generation > maxGeneration) {
      maxGeneration = strain.generation;
    }
  }

  return {
    roots: rootNodes,
    totalStrains: strains.length,
    maxGeneration,
  };
}

/**
 * Get lineage tree for a specific strain (ancestors only)
 */
export function getStrainLineage(strainId: string): LineageNode | null {
  const strains = getAllStrains();
  const strainMap = new Map(strains.map(s => [s.id, s]));

  const strain = strainMap.get(strainId);
  if (!strain) return null;

  // Find all children for each strain
  const childrenMap = new Map<string, string[]>();
  for (const s of strains) {
    if (s.parentStrains) {
      for (const parentId of s.parentStrains) {
        const existing = childrenMap.get(parentId) || [];
        existing.push(s.id);
        childrenMap.set(parentId, existing);
      }
    }
  }

  const buildNode = (s: InternalStrain, visited: Set<string> = new Set()): LineageNode => {
    if (visited.has(s.id)) {
      return {
        id: s.id,
        name: s.name,
        potency: s.potency,
        generation: s.generation ?? 0,
        parents: [],
        children: [],
        lineageNotes: s.lineageNotes,
      };
    }

    visited.add(s.id);

    const parents: LineageNode[] = [];
    if (s.parentStrains) {
      for (const parentId of s.parentStrains) {
        const parent = strainMap.get(parentId);
        if (parent) {
          parents.push(buildNode(parent, new Set(visited)));
        }
      }
    }

    return {
      id: s.id,
      name: s.name,
      potency: s.potency,
      generation: s.generation ?? 0,
      parents,
      children: childrenMap.get(s.id) || [],
      lineageNotes: s.lineageNotes,
    };
  };

  return buildNode(strain);
}

/**
 * Find the path between two strains
 */
export function findLineagePath(fromId: string, toId: string): LineagePathResponse | null {
  const strains = getAllStrains();
  const strainMap = new Map(strains.map(s => [s.id, s]));

  const fromStrain = strainMap.get(fromId);
  const toStrain = strainMap.get(toId);

  if (!fromStrain || !toStrain) return null;

  // BFS to find path
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
  const visited = new Set<string>();

  // Build adjacency list (both directions)
  const adjacency = new Map<string, string[]>();
  for (const strain of strains) {
    if (!adjacency.has(strain.id)) adjacency.set(strain.id, []);
    if (strain.parentStrains) {
      for (const parentId of strain.parentStrains) {
        // Child -> Parent
        adjacency.get(strain.id)?.push(parentId);
        // Parent -> Child
        if (!adjacency.has(parentId)) adjacency.set(parentId, []);
        adjacency.get(parentId)?.push(strain.id);
      }
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.id === toId) {
      // Found path
      const path = current.path.map(id => {
        const s = strainMap.get(id)!;
        return { id, name: s.name, generation: s.generation ?? 0 };
      });

      const distance = path.length - 1;
      const relationship = getRelationshipDescription(fromStrain, toStrain, distance);

      return { path, relationship, distance };
    }

    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const neighbors = adjacency.get(current.id) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({ id: neighbor, path: [...current.path, neighbor] });
      }
    }
  }

  return null; // No path found
}

function getRelationshipDescription(
  from: InternalStrain,
  to: InternalStrain,
  distance: number
): string {
  if (distance === 0) return "Same strain";

  const fromGen = from.generation ?? 0;
  const toGen = to.generation ?? 0;

  if (fromGen < toGen) {
    if (distance === 1) return "Parent of";
    if (distance === 2) return "Grandparent of";
    return `Ancestor (${distance} generations)`;
  } else if (fromGen > toGen) {
    if (distance === 1) return "Child of";
    if (distance === 2) return "Grandchild of";
    return `Descendant (${distance} generations)`;
  } else {
    return `Related (${distance} steps apart)`;
  }
}

/**
 * Get all descendants of a strain
 */
export function getDescendants(strainId: string): string[] {
  const strains = getAllStrains();
  const descendants: string[] = [];

  const findDescendants = (parentId: string, visited: Set<string>) => {
    for (const strain of strains) {
      if (strain.parentStrains?.includes(parentId) && !visited.has(strain.id)) {
        visited.add(strain.id);
        descendants.push(strain.id);
        findDescendants(strain.id, visited);
      }
    }
  };

  findDescendants(strainId, new Set());
  return descendants;
}

/**
 * Get all ancestors of a strain
 */
export function getAncestors(strainId: string): string[] {
  const strains = getAllStrains();
  const strainMap = new Map(strains.map(s => [s.id, s]));
  const ancestors: string[] = [];

  const findAncestors = (id: string, visited: Set<string>) => {
    const strain = strainMap.get(id);
    if (!strain?.parentStrains) return;

    for (const parentId of strain.parentStrains) {
      if (!visited.has(parentId)) {
        visited.add(parentId);
        ancestors.push(parentId);
        findAncestors(parentId, visited);
      }
    }
  };

  findAncestors(strainId, new Set());
  return ancestors;
}
