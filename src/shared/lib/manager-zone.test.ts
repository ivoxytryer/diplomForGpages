import { describe, expect, it } from 'vitest';
import type { Department } from '@/shared/types';
import { managerZoneDepartmentIds } from './manager-zone';

const departments = [
  { id: 'd1', parentId: null, headId: 'e001' },
  { id: 'd2', parentId: 'd1', headId: 'e002' },
  { id: 'd3', parentId: 'd2', headId: 'e003' },
  { id: 'd4', parentId: 'd1', headId: 'e003' },
  { id: 'd5', parentId: 'd1', headId: 'e006' },
] as unknown as Department[];

describe('managerZoneDepartmentIds', () => {
  it('включает своё подразделение, дочерние и руководимые', () => {
    const zone = managerZoneDepartmentIds(departments, 'd2', 'e003');
    expect([...zone].sort()).toEqual(['d2', 'd3', 'd4']);
  });

  it('не поднимается к родительскому подразделению', () => {
    const zone = managerZoneDepartmentIds(departments, 'd2', 'e003');
    expect(zone.has('d1')).toBe(false);
    expect(zone.has('d5')).toBe(false);
  });

  it('без привязки к сотруднику возвращает пустую зону', () => {
    expect(managerZoneDepartmentIds(departments, 'd2', null).size).toBe(0);
  });
});
