import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Network,
  UserRound,
  Users,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { OrgStructureNode } from '@/shared/types';
import { cn } from '@/shared/lib/utils';
import { PageHeader, SearchInput } from '@/shared/ui/page';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';

function findNode(nodes: OrgStructureNode[], id: string | null): OrgStructureNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function filterNode(node: OrgStructureNode, term: string): OrgStructureNode | null {
  const children = node.children
    .map((child) => filterNode(child, term))
    .filter((child): child is OrgStructureNode => Boolean(child));
  const haystack = [
    node.name,
    node.code,
    node.head?.name,
    ...node.employees.map((employee) => employee.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack.includes(term)) return children.length ? { ...node, children } : null;
  return node;
}

function collectParents(nodes: OrgStructureNode[], result = new Set<string>()) {
  nodes.forEach((node) => {
    if (node.children.length) {
      result.add(node.id);
      collectParents(node.children, result);
    }
  });
  return result;
}

function OrgTreeNode({
  node,
  depth,
  collapsed,
  selectedId,
  onToggle,
  onSelect,
  searching,
}: {
  node: OrgStructureNode;
  depth: number;
  collapsed: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  searching: boolean;
}) {
  const hasChildren = node.children.length > 0;
  const collapsedNow = !searching && collapsed.has(node.id);
  const selected = selectedId === node.id;

  return (
    <div className={cn(depth > 0 && 'ml-3 border-l border-border pl-3')}>
      <div
        className={cn(
          'flex items-stretch border-b border-border/60 transition-colors',
          selected ? 'bg-surface-2' : 'hover:bg-surface-2/50',
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="mt-1 inline-flex size-7 shrink-0 items-center justify-center text-muted transition hover:text-fg"
            aria-label={collapsedNow ? 'Развернуть подразделение' : 'Свернуть подразделение'}
          >
            {collapsedNow ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : (
          <span className="size-7 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left',
            selected && 'border-l-2 border-l-fg pl-[calc(0.5rem-2px)]',
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] font-medium text-fg">{node.name}</span>
              <Badge tone="neutral">{node.code}</Badge>
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-muted">
              <UserRound className="size-3 shrink-0" />
              <span className="truncate">
                {node.head ? node.head.name : 'Руководитель не назначен'}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-right text-[10px] leading-4 text-muted">
            <span className="block font-semibold tabular-nums text-fg">{node.totalCount} чел.</span>
            {node.children.length ? (
              <span className="block">
                прямо {node.directCount} · отделов {node.children.length}
              </span>
            ) : (
              <span className="block">прямо {node.directCount}</span>
            )}
          </span>
        </button>
      </div>

      {!collapsedNow
        ? node.children.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
              searching={searching}
            />
          ))
        : null}
    </div>
  );
}

export function OrgStructurePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();

  const query = useQuery({
    queryKey: ['org', 'structure'],
    queryFn: api.org.structure,
  });

  const roots = useMemo(() => query.data?.roots ?? [], [query.data]);
  const visibleRoots = useMemo(
    () =>
      term
        ? roots
            .map((node) => filterNode(node, term))
            .filter((node): node is OrgStructureNode => Boolean(node))
        : roots,
    [roots, term],
  );
  const selected = findNode(roots, selectedId) ?? roots[0] ?? null;
  const totalEmployees = query.data?.totalEmployees ?? 0;

  useEffect(() => {
    if (!roots.length) {
      setSelectedId(null);
      return;
    }
    if (!findNode(roots, selectedId)) setSelectedId(roots[0].id);
  }, [roots, selectedId]);

  const toggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Организация"
        title="Орг-структура"
        description="Подразделения, руководители и численность"
        actions={
          <Badge tone="neutral" dot>
            {totalEmployees} сотрудников
          </Badge>
        }
      />

      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} />
      ) : query.isLoading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </Card>
      ) : roots.length === 0 ? (
        <Card>
          <EmptyState
            title="Структура пока не настроена"
            description="Добавьте подразделения и назначьте руководителей."
            icon={Network}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Отдел, код, руководитель или сотрудник…"
                  className="min-w-[220px] flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed(new Set())}
                >
                  Развернуть
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed(collectParents(roots))}
                >
                  Свернуть
                </Button>
              </div>

              {visibleRoots.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted">
                  По запросу «{search}» ничего не найдено.
                </p>
              ) : (
                <div className="min-w-0">
                  {visibleRoots.map((node) => (
                    <OrgTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      collapsed={collapsed}
                      selectedId={selectedId}
                      onToggle={toggle}
                      onSelect={setSelectedId}
                      searching={Boolean(term)}
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className="border-t border-border p-4 lg:border-l lg:border-t-0">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold leading-5 text-fg">
                          {selected.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {selected.code}
                          {selected.parentName ? ` · ${selected.parentName}` : ' · корневое'}
                        </p>
                      </div>
                      <Badge tone="neutral">{selected.totalCount} чел.</Badge>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Руководитель
                    </p>
                    {selected.head ? (
                      <Link
                        to={`/employees/${selected.head.id}`}
                        className="mt-1 block text-xs font-medium text-fg hover:underline"
                      >
                        {selected.head.name}
                        {selected.head.positionName ? (
                          <span className="mt-0.5 block text-[10px] font-normal text-muted">
                            {selected.head.positionName}
                          </span>
                        ) : null}
                      </Link>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Не назначен</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px]">
                    <div>
                      <p className="text-muted">Прямо в отделе</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
                        {selected.directCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">С дочерними</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
                        {selected.totalCount}
                      </p>
                    </div>
                  </div>

                  {selected.children.length ? (
                    <div className="border-t border-border pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        Дочерние подразделения
                      </p>
                      <div className="mt-1 space-y-1">
                        {selected.children.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => setSelectedId(child.id)}
                            className="flex w-full items-center justify-between gap-2 text-left text-xs text-fg transition hover:text-primary"
                          >
                            <span className="truncate">{child.name}</span>
                            <span className="shrink-0 tabular-nums text-muted">
                              {child.totalCount} чел.
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t border-border pt-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                      <Users className="size-3" /> Сотрудники
                    </p>
                    {selected.employees.length ? (
                      <div className="mt-1 space-y-1.5">
                        {selected.employees.map((employee) => (
                          <Link
                            key={employee.id}
                            to={`/employees/${employee.id}`}
                            className="block text-xs text-fg transition hover:text-primary"
                          >
                            <span className="block truncate">{employee.name}</span>
                            {employee.positionName ? (
                              <span className="flex items-center gap-1 text-[10px] text-muted">
                                <Briefcase className="size-2.5" />
                                {employee.positionName}
                              </span>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted">В отделе нет сотрудников.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </Card>
      )}
    </div>
  );
}
