import dayjs from 'dayjs';
import type {
  Absence,
  AbsenceTaskDecisionRecord,
  Assignment,
  AuditEntry,
  Db,
  Department,
  Employee,
  EmployeeStatus,
  HrEvent,
  Position,
  Project,
  ProjectTask,
  TimesheetStatus,
  User,
  VacationBalance,
} from '@/shared/types';
import { formatDate } from '@/shared/lib/utils';
import { absenceDayBreakdown } from '@/shared/lib/absences';
import { absenceEventTitle, absenceEventType } from '@/shared/lib/meta';
import { hashPassword } from './password';

const DEMO_PASSWORD = 'demo1234';

const now = dayjs();
const D = (value: dayjs.Dayjs) => value.format('YYYY-MM-DD');

const maleFirst = [
  'Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Иван', 'Михаил', 'Никита',
  'Павел', 'Роман', 'Егор', 'Артём', 'Владимир', 'Константин', 'Олег', 'Григорий', 'Фёдор',
];
const femaleFirst = [
  'Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Ирина', 'Татьяна', 'Светлана', 'Юлия',
  'Екатерина', 'Алина', 'Дарья', 'Виктория', 'Полина', 'Софья', 'Ксения', 'Вера', 'Лидия',
];
const maleLast = [
  'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов',
  'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров',
  'Павлов', 'Козлов',
];
const femaleLast = [
  'Иванова', 'Смирнова', 'Кузнецова', 'Попова', 'Васильева', 'Петрова', 'Соколова', 'Михайлова',
  'Новикова', 'Фёдорова', 'Морозова', 'Волкова', 'Алексеева', 'Лебедева', 'Семёнова', 'Егорова',
  'Павлова', 'Козлова',
];
const maleMiddle = [
  'Александрович', 'Дмитриевич', 'Сергеевич', 'Андреевич', 'Алексеевич', 'Иванович',
  'Михайлович', 'Павлович', 'Романович', 'Владимирович',
];
const femaleMiddle = [
  'Александровна', 'Дмитриевна', 'Сергеевна', 'Андреевна', 'Алексеевна', 'Ивановна',
  'Михайловна', 'Павловна', 'Романовна', 'Владимировна',
];

const translitMap: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function translit(value: string) {
  return value
    .toLowerCase()
    .split('')
    .map((char) => translitMap[char] ?? char)
    .join('');
}

function salaryFor(positionId: string) {
  const base: Record<string, number> = {
    p1: 350000,
    p2: 120000,
    p3: 95000,
    p4: 240000,
    p5: 170000,
    p6: 130000,
    p7: 140000,
    p8: 100000,
    p9: 100000,
    p10: 70000,
    p11: 150000,
    p12: 170000,
    p13: 220000,
    p14: 220000,
    p15: 300000,
    p16: 160000,
    p17: 190000,
    p18: 150000,
    p19: 160000,
    p20: 100000,
    p21: 200000,
  };
  return base[positionId] ?? 90000;
}

function positionForDepartment(departmentId: string, index: number) {
  switch (departmentId) {
    case 'd2':
      return 'p2';
    case 'd3':
      return 'p3';
    case 'd4':
      return 'p7';
    case 'd5':
      return index % 3 === 0 ? 'p6' : 'p5';
    case 'd6':
      return 'p8';
    case 'd7':
      return 'p9';
    case 'd8':
      return 'p10';
    default:
      return 'p10';
  }
}

function generatedDepartment(index: number) {
  const fixed: Record<number, string> = {
    5: 'd3',
    6: 'd6',
    7: 'd7',
    8: 'd8',
    9: 'd4',
    10: 'd5',
    12: 'd2',
    13: 'd5',
    14: 'd5',
    15: 'd6',
    16: 'd7',
  };
  if (fixed[index]) return fixed[index];
  const rotation = ['d5', 'd5', 'd3', 'd6', 'd7', 'd8', 'd5', 'd4', 'd6', 'd5'];
  return rotation[index % rotation.length];
}

const departmentHeads: Record<string, string | null> = {
  d1: 'e001',
  d2: 'e002',
  d3: 'e005',
  d4: 'e003',
  d5: 'e003',
  d6: 'e006',
  d7: 'e007',
  d8: 'e008',
};

function specialEmployees(): Employee[] {
  return [
    {
      id: 'e001',
      personnelNumber: '0001',
      lastName: 'Иванов',
      firstName: 'Александр',
      middleName: 'Сергеевич',
      birthDate: '1978-04-12',
      gender: 'male',
      email: 'a.ivanov@company.ru',
      phone: '+7 (495) 100-00-01',
      departmentId: 'd1',
      positionId: 'p1',
      managerId: null,
      hireDate: '2018-03-12',
      status: 'active',
      employmentType: 'full',
      salary: 350000,
      education: 'МГУ им. М. В. Ломоносова, менеджмент',
    },
    {
      id: 'e002',
      personnelNumber: '0002',
      lastName: 'Смирнова',
      firstName: 'Мария',
      middleName: 'Андреевна',
      birthDate: '1986-09-23',
      gender: 'female',
      email: 'm.smirnova@company.ru',
      phone: '+7 (495) 100-00-02',
      departmentId: 'd2',
      positionId: 'p2',
      managerId: 'e001',
      hireDate: '2019-06-03',
      status: 'active',
      employmentType: 'full',
      salary: 120000,
      education: 'РГГУ, управление персоналом',
    },
    {
      id: 'e003',
      personnelNumber: '0003',
      lastName: 'Кузнецов',
      firstName: 'Дмитрий',
      middleName: 'Алексеевич',
      birthDate: '1984-02-15',
      gender: 'male',
      email: 'd.kuznetsov@company.ru',
      phone: '+7 (495) 100-00-03',
      departmentId: 'd5',
      positionId: 'p4',
      managerId: 'e001',
      hireDate: '2019-11-18',
      status: 'active',
      employmentType: 'full',
      salary: 240000,
      education: 'МФТИ, прикладная математика и информатика',
    },
    {
      id: 'e004',
      personnelNumber: '0004',
      lastName: 'Попова',
      firstName: 'Анна',
      middleName: 'Дмитриевна',
      birthDate: '1994-07-08',
      gender: 'female',
      email: 'a.popova@company.ru',
      phone: '+7 (495) 100-00-04',
      departmentId: 'd5',
      positionId: 'p5',
      managerId: 'e003',
      hireDate: '2021-02-01',
      status: 'active',
      employmentType: 'full',
      salary: 180000,
      education: 'НИУ ВШЭ, программная инженерия',
    },
    {
      id: 'e011',
      personnelNumber: '0011',
      lastName: 'Соколов',
      firstName: 'Павел',
      middleName: 'Романович',
      birthDate: '1990-12-01',
      gender: 'male',
      email: 'p.sokolov@company.ru',
      phone: '+7 (495) 100-00-11',
      departmentId: 'd4',
      positionId: 'p11',
      managerId: 'e003',
      hireDate: '2020-08-17',
      status: 'active',
      employmentType: 'full',
      salary: 150000,
      education: 'МИРЭА, информационные системы',
    },
  ];
}

function generateEmployees(): Employee[] {
  const result: Employee[] = [...specialEmployees()];
  for (let index = 5; index <= 42; index += 1) {
    if (index === 11) continue;
    const gender = index % 2 === 0 ? 'male' : 'female';
    const isFemale = gender === 'female';
    const lastName = (isFemale ? femaleLast : maleLast)[index % 18];
    const firstName = (isFemale ? femaleFirst : maleFirst)[index % 18];
    const middleName = (isFemale ? femaleMiddle : maleMiddle)[index % 10];
    const departmentId = generatedDepartment(index);
    const id = `e${String(index).padStart(3, '0')}`;
    let positionId = positionForDepartment(departmentId, index);
    if (id === 'e005') positionId = 'p17';
    const isDismissed = index % 17 === 0;
    const isProbation = !isDismissed && index % 13 === 0;
    const hireDate = isProbation
      ? now.subtract(20 + (index % 20), 'day')
      : now.subtract(420 + ((index * 53) % 1500), 'day');

    result.push({
      id,
      personnelNumber: String(index).padStart(4, '0'),
      lastName,
      firstName,
      middleName,
      birthDate: `${now.year() - (24 + (index % 26))}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
      gender,
      email: `${translit(lastName)}.${translit(firstName).charAt(0)}${index}@company.ru`,
      phone: `+7 (9${String(10 + (index % 80)).padStart(2, '0')}) ${String(100 + ((index * 3) % 900))}-${String(10 + ((index * 7) % 90))}-${String(10 + (index % 90))}`,
      departmentId,
      positionId,
      managerId: departmentHeads[departmentId] ?? 'e001',
      hireDate: D(hireDate),
      dismissalDate: isDismissed ? D(now.subtract(5 + (index % 40), 'day')) : null,
      status: (isDismissed ? 'dismissed' : isProbation ? 'probation' : 'active') as EmployeeStatus,
      employmentType: index % 11 === 0 ? 'contract' : index % 9 === 0 ? 'part' : 'full',
      salary: salaryFor(positionId) + (index % 7) * 4000,
      education: index % 3 === 0 ? 'МГТУ им. Н. Э. Баумана' : 'Российский экономический университет',
    });
  }
  return result;
}

function seedDepartments(): Department[] {
  return [
    { id: 'd1', name: 'Генеральный директорат', code: 'GD', parentId: null, headId: 'e001', description: 'Управление организацией' },
    { id: 'd2', name: 'Отдел кадров', code: 'HR', parentId: 'd1', headId: 'e002', description: 'Кадровое администрирование и подбор' },
    { id: 'd3', name: 'Бухгалтерия', code: 'FIN', parentId: 'd1', headId: 'e005', description: 'Финансовый и налоговый учёт' },
    { id: 'd4', name: 'IT-департамент', code: 'IT', parentId: 'd1', headId: 'e003', description: 'Информационные технологии и инфраструктура' },
    { id: 'd5', name: 'Отдел разработки', code: 'DEV', parentId: 'd4', headId: 'e003', description: 'Разработка и тестирование ПО' },
    { id: 'd6', name: 'Отдел продаж', code: 'SALES', parentId: 'd1', headId: 'e006', description: 'Продажи и работа с клиентами' },
    { id: 'd7', name: 'Маркетинг', code: 'MKT', parentId: 'd1', headId: 'e007', description: 'Продвижение и коммуникации' },
    { id: 'd8', name: 'Административный отдел', code: 'ADM', parentId: 'd1', headId: 'e008', description: 'Офис и хозяйственное обеспечение' },
  ];
}

export function seedPositions(): Position[] {
  return [
    { id: 'p1', name: 'Генеральный директор', departmentId: 'd1', family: 'Руководство', grade: 4, salaryMin: 300000, salaryMax: 450000 },
    { id: 'p2', name: 'HR-менеджер', departmentId: 'd2', family: 'HR', grade: 2, salaryMin: 90000, salaryMax: 160000 },
    { id: 'p16', name: 'Старший HR-менеджер', departmentId: 'd2', family: 'HR', grade: 3, salaryMin: 130000, salaryMax: 190000 },
    { id: 'p3', name: 'Бухгалтер', departmentId: 'd3', family: 'Финансы', grade: 2, salaryMin: 80000, salaryMax: 140000 },
    { id: 'p17', name: 'Главный бухгалтер', departmentId: 'd3', family: 'Финансы', grade: 3, salaryMin: 150000, salaryMax: 240000 },
    { id: 'p4', name: 'Тимлид', departmentId: 'd5', family: 'Руководство', grade: 4, salaryMin: 200000, salaryMax: 300000 },
    { id: 'p5', name: 'Разработчик', departmentId: 'd5', family: 'Backend', grade: 2, salaryMin: 130000, salaryMax: 240000 },
    { id: 'p14', name: 'Старший разработчик', departmentId: 'd5', family: 'Backend', grade: 3, salaryMin: 180000, salaryMax: 280000 },
    { id: 'p15', name: 'Ведущий разработчик', departmentId: 'd5', family: 'Backend', grade: 4, salaryMin: 240000, salaryMax: 360000 },
    { id: 'p6', name: 'Тестировщик', departmentId: 'd5', family: 'QA', grade: 2, salaryMin: 100000, salaryMax: 170000 },
    { id: 'p12', name: 'Старший тестировщик', departmentId: 'd5', family: 'QA', grade: 3, salaryMin: 140000, salaryMax: 210000 },
    { id: 'p13', name: 'Ведущий тестировщик', departmentId: 'd5', family: 'QA', grade: 4, salaryMin: 180000, salaryMax: 260000 },
    { id: 'p7', name: 'Системный администратор', departmentId: 'd4', family: 'IT', grade: 2, salaryMin: 110000, salaryMax: 180000 },
    { id: 'p11', name: 'Администратор информационных систем', departmentId: 'd4', family: 'IT', grade: 3, salaryMin: 120000, salaryMax: 190000 },
    { id: 'p21', name: 'Ведущий IT-специалист', departmentId: 'd4', family: 'IT', grade: 4, salaryMin: 160000, salaryMax: 240000 },
    { id: 'p8', name: 'Менеджер по продажам', departmentId: 'd6', family: 'Продажи', grade: 2, salaryMin: 85000, salaryMax: 160000 },
    { id: 'p19', name: 'Старший менеджер по продажам', departmentId: 'd6', family: 'Продажи', grade: 3, salaryMin: 130000, salaryMax: 210000 },
    { id: 'p9', name: 'Маркетолог', departmentId: 'd7', family: 'Маркетинг', grade: 2, salaryMin: 85000, salaryMax: 150000 },
    { id: 'p18', name: 'Старший маркетолог', departmentId: 'd7', family: 'Маркетинг', grade: 3, salaryMin: 120000, salaryMax: 180000 },
    { id: 'p10', name: 'Офис-менеджер', departmentId: 'd8', family: 'Административный', grade: 1, salaryMin: 60000, salaryMax: 100000 },
    { id: 'p20', name: 'Старший офис-менеджер', departmentId: 'd8', family: 'Административный', grade: 2, salaryMin: 85000, salaryMax: 130000 },
  ];
}

function seedProjects(): Project[] {
  return [
    { id: 'pr1', code: 'ERP', name: 'Внедрение ERP-системы', description: 'Перевод кадрового и финансового учёта в единую ERP-платформу', status: 'active', startDate: D(now.subtract(4, 'month')), endDate: D(now.add(5, 'month')), managerId: 'e003', color: '#4f46e5' },
    { id: 'pr2', code: 'MOB', name: 'Мобильное приложение «Мой офис»', description: 'Личный кабинет сотрудника в мобильном приложении', status: 'active', startDate: D(now.subtract(2, 'month')), endDate: D(now.add(6, 'month')), managerId: 'e003', color: '#0ea5e9' },
    { id: 'pr3', code: 'PORTAL', name: 'Портал самообслуживания', description: 'HR-портал для заявлений, справок и заявок на отпуск', status: 'active', startDate: D(now.subtract(1, 'month')), endDate: D(now.add(4, 'month')), managerId: 'e003', color: '#10b981' },
    { id: 'pr4', code: 'CLOUD', name: 'Миграция в облако', description: 'Перенос инфраструктуры в облачный контур', status: 'paused', startDate: D(now.subtract(6, 'month')), endDate: D(now.add(2, 'month')), managerId: 'e011', color: '#f59e0b' },
    { id: 'pr5', code: 'CRM', name: 'CRM-релиз 2.0', description: 'Обновление CRM для отдела продаж', status: 'active', startDate: D(now.subtract(3, 'month')), endDate: D(now.add(3, 'month')), managerId: 'e006', color: '#ec4899' },
    { id: 'pr6', code: 'BRAND', name: 'Ребрендинг компании', description: 'Обновление фирменного стиля и коммуникаций', status: 'completed', startDate: D(now.subtract(8, 'month')), endDate: D(now.subtract(1, 'month')), managerId: 'e007', color: '#8b5cf6' },
    { id: 'pr7', code: 'BI', name: 'Автоматизация отчётности', description: 'BI-дашборды по кадрам, финансам и проектам', status: 'active', startDate: D(now.subtract(2, 'month')), endDate: D(now.add(4, 'month')), managerId: 'e005', color: '#14b8a6' },
    { id: 'pr8', code: 'SITE', name: 'Корпоративный сайт', description: 'Новый сайт компании с разделом вакансий', status: 'completed', startDate: D(now.subtract(10, 'month')), endDate: D(now.subtract(2, 'month')), managerId: 'e007', color: '#f97316' },
  ];
}

const assignmentPlan: [string, string, string, number][] = [
  ['pr1', 'e003', 'Руководитель проекта', 20],
  ['pr2', 'e003', 'Руководитель проекта', 20],
  ['pr3', 'e003', 'Руководитель проекта', 10],
  ['pr1', 'e004', 'Ведущий разработчик', 60],
  ['pr2', 'e004', 'Разработчик', 30],
  ['pr7', 'e005', 'Заказчик', 40],
  ['pr5', 'e006', 'Владелец продукта', 40],
  ['pr6', 'e007', 'Руководитель проекта', 50],
  ['pr7', 'e008', 'Администратор', 20],
  ['pr1', 'e009', 'Аналитик', 30],
  ['pr4', 'e009', 'Инженер', 40],
  ['pr2', 'e010', 'Тестировщик', 50],
  ['pr1', 'e012', 'Разработчик', 40],
  ['pr3', 'e013', 'Разработчик', 60],
  ['pr4', 'e014', 'Инженер', 50],
  ['pr5', 'e015', 'Менеджер', 40],
  ['pr6', 'e016', 'Дизайнер', 30],
  ['pr7', 'e017', 'Аналитик', 50],
  ['pr8', 'e018', 'Контент-менеджер', 40],
  ['pr1', 'e019', 'Тестировщик', 20],
  ['pr5', 'e019', 'Аналитик', 30],
  ['pr2', 'e020', 'Разработчик', 20],
  ['pr3', 'e020', 'Разработчик', 20],
  ['pr4', 'e021', 'Инженер', 60],
  ['pr5', 'e022', 'Менеджер', 30],
  ['pr6', 'e023', 'Дизайнер', 40],
  ['pr7', 'e024', 'Аналитик', 30],
  ['pr8', 'e025', 'Контент-менеджер', 20],
  ['pr1', 'e026', 'Разработчик', 40],
  ['pr2', 'e026', 'Разработчик', 30],
  ['pr3', 'e026', 'Разработчик', 30],
  ['pr4', 'e027', 'Инженер', 30],
  ['pr5', 'e028', 'Менеджер', 20],
  ['pr6', 'e029', 'Дизайнер', 20],
  ['pr7', 'e030', 'Аналитик', 40],
  ['pr8', 'e031', 'Контент-менеджер', 30],
  ['pr1', 'e032', 'Тестировщик', 30],
  ['pr2', 'e033', 'Разработчик', 40],
  ['pr3', 'e035', 'Разработчик', 30],
  ['pr4', 'e036', 'Инженер', 20],
  ['pr5', 'e037', 'Менеджер', 30],
  ['pr6', 'e038', 'Дизайнер', 20],
  ['pr7', 'e039', 'Аналитик', 20],
  ['pr8', 'e040', 'Контент-менеджер', 30],
  ['pr1', 'e041', 'Тестировщик', 10],
  ['pr2', 'e042', 'Разработчик', 20],
];

function seedAssignments(employees: Employee[]): Assignment[] {
  const valid = new Set(employees.filter((employee) => employee.status !== 'dismissed').map((employee) => employee.id));
  return assignmentPlan
    .filter(([, employeeId]) => valid.has(employeeId))
    .map(([projectId, employeeId, projectRole, allocation], index) => ({
      id: `a${String(index + 1).padStart(3, '0')}`,
      projectId,
      employeeId,
      projectRole,
      allocation,
      startDate: D(now.subtract(2, 'month')),
      endDate: null,
    }));
}

export function seedProjectTasks(): ProjectTask[] {
  const today = D(now);
  const yesterday = D(now.subtract(1, 'day'));
  const twoDaysAgo = D(now.subtract(2, 'day'));
  const threeDaysAgo = D(now.subtract(3, 'day'));
  const manager = { createdById: 'u3', createdByName: 'Дмитрий Кузнецов' };
  const admin = { createdById: 'u1', createdByName: 'Павел Соколов' };

  const raw: Array<Omit<ProjectTask, 'id' | 'carryCount' | 'carryHistory'>> = [
    {
      projectId: 'pr1',
      employeeId: 'e004',
      title: 'Подготовить макет личного кабинета',
      description: 'Собрать финальный макет главного экрана и согласовать с дизайнером.',
      dueDate: today,
      estimateHours: 6,
      status: 'todo',
      originalDueDate: today,
      createdAt: now.subtract(3, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr2',
      employeeId: 'e004',
      title: 'Проверить сценарий авторизации',
      description: 'Вход, восстановление пароля и выход из приложения.',
      dueDate: yesterday,
      estimateHours: 4,
      status: 'todo',
      originalDueDate: yesterday,
      createdAt: now.subtract(5, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr1',
      employeeId: 'e004',
      title: 'Согласовать требования с заказчиком',
      dueDate: D(now.add(2, 'day')),
      estimateHours: 3,
      status: 'todo',
      originalDueDate: D(now.add(2, 'day')),
      createdAt: now.subtract(1, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr2',
      employeeId: 'e004',
      title: 'Обновить документацию API',
      dueDate: threeDaysAgo,
      estimateHours: 2,
      status: 'done',
      originalDueDate: threeDaysAgo,
      createdAt: now.subtract(7, 'day').toISOString(),
      completedAt: now.subtract(2, 'day').toISOString(),
      completionComment: 'Обновила описание авторизации и примеры запросов, ссылку на документацию отправила в чат проекта.',
      completedById: 'e004',
      completedByName: 'Попова Анна',
      ...manager,
    },
    {
      projectId: 'pr1',
      employeeId: 'e004',
      title: 'Настроить интеграцию с 1С',
      description: 'Потребовалось больше времени на согласование формата обмена.',
      dueDate: today,
      estimateHours: 8,
      status: 'todo',
      originalDueDate: yesterday,
      createdAt: now.subtract(4, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr1',
      employeeId: 'e003',
      title: 'Провести демо для заказчика',
      dueDate: today,
      estimateHours: 2,
      status: 'todo',
      originalDueDate: today,
      createdAt: now.subtract(2, 'day').toISOString(),
      completedAt: null,
      ...admin,
    },
    {
      projectId: 'pr3',
      employeeId: 'e013',
      title: 'Подготовить план релиза',
      dueDate: D(now.add(4, 'day')),
      estimateHours: 4,
      status: 'todo',
      originalDueDate: D(now.add(4, 'day')),
      createdAt: now.subtract(1, 'day').toISOString(),
      completedAt: null,
      ...admin,
    },
    {
      projectId: 'pr2',
      employeeId: 'e003',
      title: 'Ревью pull request',
      dueDate: today,
      estimateHours: 1,
      status: 'done',
      originalDueDate: today,
      createdAt: now.subtract(1, 'day').toISOString(),
      completedAt: now.subtract(3, 'hour').toISOString(),
      completionComment: 'Проверил изменения, замечаний нет — можно мержить.',
      completedById: 'e003',
      completedByName: 'Кузнецов Дмитрий',
      ...admin,
    },
    {
      projectId: 'pr1',
      employeeId: 'e009',
      title: 'Собрать требования по модулю',
      dueDate: today,
      estimateHours: 5,
      status: 'todo',
      originalDueDate: today,
      createdAt: now.subtract(2, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr2',
      employeeId: 'e010',
      title: 'Прогнать регрессионные тесты',
      dueDate: D(now.add(1, 'day')),
      estimateHours: 6,
      status: 'todo',
      originalDueDate: D(now.add(1, 'day')),
      createdAt: now.subtract(1, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr1',
      employeeId: 'e012',
      title: 'Разработать API справочника',
      dueDate: yesterday,
      estimateHours: 8,
      status: 'done',
      originalDueDate: yesterday,
      createdAt: now.subtract(6, 'day').toISOString(),
      completedAt: now.subtract(1, 'day').toISOString(),
      completionComment: 'API справочника готов, покрыл тестами и передал фронтенду.',
      completedById: 'e012',
      completedByName: 'Сотрудник проекта',
      ...manager,
    },
    {
      projectId: 'pr1',
      employeeId: 'e019',
      title: 'Подготовить тест-кейсы',
      dueDate: D(now.add(2, 'day')),
      estimateHours: 4,
      status: 'todo',
      originalDueDate: D(now.add(2, 'day')),
      createdAt: now.subtract(1, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr3',
      employeeId: 'e013',
      title: 'Сверстать страницу заявок',
      dueDate: today,
      estimateHours: 7,
      status: 'todo',
      originalDueDate: today,
      createdAt: now.subtract(3, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr2',
      employeeId: 'e020',
      title: 'Исправить ошибки входа',
      description: 'Ошибка воспроизводится на Android 14.',
      dueDate: twoDaysAgo,
      estimateHours: 3,
      status: 'todo',
      originalDueDate: twoDaysAgo,
      createdAt: now.subtract(6, 'day').toISOString(),
      completedAt: null,
      ...manager,
    },
    {
      projectId: 'pr1',
      employeeId: 'e003',
      title: 'Утвердить архитектуру решения',
      dueDate: D(now.subtract(5, 'day')),
      estimateHours: 2,
      status: 'done',
      originalDueDate: D(now.subtract(5, 'day')),
      createdAt: now.subtract(10, 'day').toISOString(),
      completedAt: now.subtract(4, 'day').toISOString(),
      completionComment: 'Архитектура согласована на техсовете, замечания учтены.',
      completedById: 'e003',
      completedByName: 'Кузнецов Дмитрий',
      ...admin,
    },
  ];

  return raw.map((task, index) => ({
    ...task,
    id: `t${String(index + 1).padStart(3, '0')}`,
    carryCount: task.employeeId === 'e004' && task.title === 'Настроить интеграцию с 1С' ? 1 : 0,
    carryHistory:
      task.employeeId === 'e004' && task.title === 'Настроить интеграцию с 1С'
        ? [
            {
              from: yesterday,
              to: today,
              at: now.subtract(1, 'day').hour(18).minute(10).toISOString(),
            },
          ]
        : [],
    completionHistory:
      task.status === 'done' && task.completionComment
        ? [
            {
              action: 'done' as const,
              comment: task.completionComment,
              at: task.completedAt ?? task.createdAt,
              byId: task.completedById ?? task.employeeId,
              byName: task.completedByName ?? 'Сотрудник',
            },
          ]
        : [],
  }));
}

function seedAbsences(): Absence[] {
  const monthStart = now.startOf('month');

  const raw: Array<{
    employeeId: string;
    type: Absence['type'];
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
    status: Absence['status'];
    reason?: string;
  }> = [
    { employeeId: 'e006', type: 'vacation', start: monthStart.add(9, 'day'), end: monthStart.add(13, 'day'), status: 'approved', reason: 'Плановый отпуск' },
    { employeeId: 'e008', type: 'sick', start: monthStart.add(2, 'day'), end: monthStart.add(4, 'day'), status: 'approved', reason: 'Больничный лист' },
    { employeeId: 'e003', type: 'business_trip', start: monthStart.add(4, 'day'), end: monthStart.add(5, 'day'), status: 'approved', reason: 'Встреча с заказчиком' },
    { employeeId: 'e009', type: 'vacation', start: monthStart.add(17, 'day'), end: monthStart.add(21, 'day'), status: 'pending', reason: 'Семейные обстоятельства' },
    { employeeId: 'e010', type: 'unpaid', start: monthStart.add(19, 'day'), end: monthStart.add(19, 'day'), status: 'approved', reason: 'Личные дела' },
    { employeeId: 'e012', type: 'vacation', start: monthStart.add(15, 'day'), end: monthStart.add(26, 'day'), status: 'approved', reason: 'Ежегодный оплачиваемый отпуск' },
    { employeeId: 'e004', type: 'vacation', start: now.add(1, 'month').startOf('month').add(9, 'day'), end: now.add(1, 'month').startOf('month').add(22, 'day'), status: 'approved', reason: 'Ежегодный отпуск' },
    { employeeId: 'e015', type: 'study', start: now.add(1, 'month').startOf('month').add(2, 'day'), end: now.add(1, 'month').startOf('month').add(6, 'day'), status: 'pending', reason: 'Сессия' },
    { employeeId: 'e021', type: 'sick', start: monthStart.add(10, 'day'), end: monthStart.add(11, 'day'), status: 'approved', reason: 'Больничный лист' },
    { employeeId: 'e027', type: 'vacation', start: monthStart.add(23, 'day'), end: monthStart.add(27, 'day'), status: 'pending', reason: 'Отпуск за свой счёт' },
  ];

  return raw.map((item, index) => {
    const startDate = D(item.start);
    const endDate = D(item.end);
    const breakdown = absenceDayBreakdown(item.type, startDate, endDate);
    return {
      id: `ab${String(index + 1).padStart(3, '0')}`,
      employeeId: item.employeeId,
      type: item.type,
      startDate,
      endDate,
      ...breakdown,
      status: item.status,
      reason: item.reason,
      createdAt: D(item.start.subtract(10, 'day')),
      approvedBy: item.status === 'approved' ? 'e002' : null,
      confirmedAt:
        item.type === 'sick' && item.status === 'approved'
          ? D(item.start)
          : null,
      confirmedBy:
        item.type === 'sick' && item.status === 'approved' ? 'e002' : null,
    };
  });
}

function seedAbsenceTaskDecisions(): AbsenceTaskDecisionRecord[] {
  const at = now.subtract(3, 'day').toISOString();
  return [
    {
      id: 'atd001',
      absenceId: 'ab003',
      taskId: 't006',
      action: 'keep',
      fromEmployeeId: 'e003',
      toEmployeeId: null,
      comment: 'Проводит демо удалённо — задача остаётся у сотрудника',
      byUserId: 'u2',
      byUserName: 'Мария Смирнова',
      at,
    },
    {
      id: 'atd002',
      absenceId: 'ab003',
      taskId: 't007',
      action: 'reassign',
      fromEmployeeId: 'e003',
      toEmployeeId: 'e013',
      comment: 'Передано коллеге на время командировки',
      byUserId: 'u2',
      byUserName: 'Мария Смирнова',
      at,
    },
  ];
}

function seedEvents(employees: Employee[], absences: Absence[]): HrEvent[] {
  const events: HrEvent[] = [];
  employees.forEach((employee, index) => {
    events.push({
      id: `ev${String(index + 1).padStart(3, '0')}`,
      employeeId: employee.id,
      type: 'hire',
      date: employee.hireDate,
      title: 'Приём на работу',
      description: `Оформлен в подразделение «${employee.departmentId}»`,
      toDepartmentId: employee.departmentId,
      toPositionId: employee.positionId,
      authorId: 'e002',
    });
  });

  let extra = events.length;
  const push = (event: Omit<HrEvent, 'id'>) => {
    extra += 1;
    events.push({ ...event, id: `ev${String(extra).padStart(3, '0')}` });
  };

  push({
    employeeId: 'e002',
    type: 'promotion',
    date: D(now.subtract(4, 'month')),
    title: 'Повышение до HR-менеджера',
    description: 'Расширение зоны ответственности: кадровый учёт и подбор',
    toPositionId: 'p2',
    newSalary: 120000,
    authorId: 'e001',
  });
  push({
    employeeId: 'e003',
    type: 'transfer',
    date: D(now.subtract(8, 'month')),
    title: 'Перевод в отдел разработки',
    description: 'Назначен тимлидом направления',
    fromDepartmentId: 'd4',
    toDepartmentId: 'd5',
    fromPositionId: 'p5',
    toPositionId: 'p4',
    authorId: 'e001',
  });
  push({
    employeeId: 'e004',
    type: 'salary_change',
    date: D(now.subtract(2, 'month')),
    title: 'Изменение оклада',
    description: 'Пересмотр оклада по итогам аттестации',
    oldSalary: 160000,
    newSalary: 180000,
    authorId: 'e011',
  });
  push({
    employeeId: 'e005',
    type: 'promotion',
    date: D(now.subtract(6, 'month')),
    title: 'Назначение главным бухгалтером',
    toPositionId: 'p17',
    newSalary: 190000,
    authorId: 'e001',
  });

  employees
    .filter((employee) => employee.status === 'dismissed')
    .forEach((employee) => {
      push({
        employeeId: employee.id,
        type: 'dismissal',
        date: employee.dismissalDate ?? D(now.subtract(10, 'day')),
        title: 'Увольнение',
        description: 'Расторжение трудового договора по соглашению сторон',
        authorId: 'e002',
      });
    });

  absences
    .filter((absence) => absence.status === 'approved')
    .forEach((absence) => {
      push({
        employeeId: absence.employeeId,
        type: absenceEventType[absence.type],
        date: absence.startDate,
        title: absenceEventTitle[absence.type],
        description: `Период: ${formatDate(absence.startDate)} — ${formatDate(absence.endDate)}${
          absence.reason ? ` · ${absence.reason}` : ''
        }`,
        absenceId: absence.id,
        authorId: 'e002',
      });
    });

  return events;
}

function seedUsers(): User[] {
  return [
    { id: 'u1', email: 'admin@hr.local', name: 'Павел Соколов', role: 'admin', employeeId: 'e011', isActive: true },
    { id: 'u2', email: 'hr@hr.local', name: 'Мария Смирнова', role: 'hr', employeeId: 'e002', isActive: true },
    { id: 'u3', email: 'manager@hr.local', name: 'Дмитрий Кузнецов', role: 'manager', employeeId: 'e003', isActive: true },
    { id: 'u4', email: 'employee@hr.local', name: 'Анна Попова', role: 'employee', employeeId: 'e004', isActive: true },
    { id: 'u5', email: 'sales@hr.local', name: 'Сергей Волков', role: 'manager', employeeId: 'e006', isActive: true },
  ];
}

function seedVacationBalances(employees: Employee[]): VacationBalance[] {
  const year = now.year();
  return employees
    .filter((employee) => employee.status !== 'dismissed')
    .map((employee, index) => ({
      id: `vb${String(index + 1).padStart(3, '0')}`,
      employeeId: employee.id,
      year,
      entitlement: 28,
      carryover: employee.id === 'e004' ? 3 : 0,
      updatedAt: now.startOf('year').toISOString(),
    }));
}

function seedAudit(): AuditEntry[] {
  return [
    {
      id: 'au1',
      at: now.subtract(2, 'hour').toISOString(),
      userId: 'u2',
      userName: 'Мария Смирнова',
      action: 'Согласована заявка на отпуск',
      entity: 'absence',
      entityId: 'ab001',
      details: 'Сотрудник: Смирнова Мария Андреевна',
    },
    {
      id: 'au2',
      at: now.subtract(1, 'day').toISOString(),
      userId: 'u1',
      userName: 'Павел Соколов',
      action: 'Изменена роль пользователя',
      entity: 'user',
      entityId: 'u4',
      details: 'Роль: сотрудник',
    },
    {
      id: 'au3',
      at: now.subtract(3, 'day').toISOString(),
      userId: 'u2',
      userName: 'Мария Смирнова',
      action: 'Добавлен сотрудник',
      entity: 'employee',
      entityId: 'e042',
      details: 'Карточка сотрудника создана',
    },
  ];
}

export function createSeed(): Db {
  const employees = generateEmployees();
  const absences = seedAbsences();
  const users = seedUsers();
  const today = D(now);

  employees.forEach((employee) => {
    if (employee.status === 'dismissed') return;
    const activeAbsence = absences.find(
      (absence) =>
        absence.employeeId === employee.id &&
        absence.status === 'approved' &&
        absence.startDate <= today &&
        absence.endDate >= today,
    );
    // Командировка — рабочие дни, статус сотрудника при этом не меняется.
    if (activeAbsence && activeAbsence.type !== 'business_trip') {
      employee.status = activeAbsence.type === 'sick' ? 'sick_leave' : 'vacation';
    }
  });

  const previousMonth = now.subtract(1, 'month').format('YYYY-MM');
  const timesheetStatuses: Record<string, TimesheetStatus> = {};
  employees
    .filter((employee) => employee.status !== 'dismissed')
    .forEach((employee) => {
      timesheetStatuses[`${employee.id}|${previousMonth}`] = 'approved';
    });

  return {
    employees,
    departments: seedDepartments(),
    positions: seedPositions(),
    projects: seedProjects(),
    assignments: seedAssignments(employees),
    projectTasks: seedProjectTasks(),
    absences,
    absenceTaskDecisions: seedAbsenceTaskDecisions(),
    vacationBalances: seedVacationBalances(employees),
    events: seedEvents(employees, absences),
    users,
    notifications: [],
    audit: seedAudit(),
    timesheetOverrides: {},
    timesheetStatuses,
    passwordHashes: Object.fromEntries(
      users.map((user) => [user.id, hashPassword(DEMO_PASSWORD, user.id)]),
    ),
    seededAt: now.toISOString(),
  };
}
