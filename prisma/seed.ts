import "dotenv/config";

import { faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Use relative imports (not the "@/" alias) so the script runs standalone via tsx.
import { PrismaClient } from "../app/generated/prisma/client";
import {
  EmploymentType,
  PayType,
  EmployeeStatus,
} from "../app/generated/prisma/enums";

const COUNT = 500;

const DEPARTMENTS = [
  "Operations",
  "Cleaning",
  "Maintenance",
  "Administration",
  "Finance",
];

const SITES = [
  "Dallas Plant",
  "Austin Warehouse",
  "Houston Office",
  "Phoenix Distribution Center",
];

const ROLE_FAMILIES = [
  "Individual Contributor",
  "Team Lead",
  "Manager",
  "Director",
];

// Deterministic data so reseeding produces the same set.
faker.seed(20260611);

function buildEmployee(index: number) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const hireDate = faker.date.past({ years: 8 });

  // Most employees active; a few on leave; some terminated.
  const status = faker.helpers.weightedArrayElement([
    { weight: 85, value: EmployeeStatus.ACTIVE },
    { weight: 7, value: EmployeeStatus.LEAVE_OF_ABSENCE },
    { weight: 8, value: EmployeeStatus.TERMINATED },
  ]);

  const terminationDate =
    status === EmployeeStatus.TERMINATED
      ? faker.date.between({ from: hireDate, to: new Date() })
      : null;

  return {
    employeeId: `E-${1001 + index}`,
    firstName,
    lastName,
    preferredName: faker.datatype.boolean(0.2)
      ? faker.person.firstName()
      : null,
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    phone: faker.phone.number(),
    department: faker.helpers.arrayElement(DEPARTMENTS),
    roleTitle: faker.person.jobTitle(),
    roleFamily: faker.helpers.arrayElement(ROLE_FAMILIES),
    site: faker.helpers.arrayElement(SITES),
    manager: faker.person.fullName(),
    employmentType: faker.helpers.weightedArrayElement([
      { weight: 70, value: EmploymentType.FULL_TIME },
      { weight: 15, value: EmploymentType.PART_TIME },
      { weight: 10, value: EmploymentType.CONTRACTOR },
      { weight: 5, value: EmploymentType.SEASONAL },
    ]),
    payType: faker.helpers.weightedArrayElement([
      { weight: 60, value: PayType.HOURLY },
      { weight: 40, value: PayType.SALARY },
    ]),
    status,
    hireDate,
    terminationDate,
    notes: faker.datatype.boolean(0.15) ? faker.lorem.sentence() : null,
  };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // Reset so the table contains exactly the seeded set (and to avoid
    // employeeId collisions on reseed).
    const deleted = await prisma.employee.deleteMany();
    console.log(`Cleared ${deleted.count} existing employee(s).`);

    const employees = Array.from({ length: COUNT }, (_, i) => buildEmployee(i));
    const created = await prisma.employee.createMany({ data: employees });
    console.log(`Inserted ${created.count} employees.`);

    const total = await prisma.employee.count();
    console.log(`Employee row count is now ${total}.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
