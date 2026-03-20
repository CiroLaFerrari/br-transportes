/**
 * Cria usuario admin. Uso: npx tsx scripts/create-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@brtransportes.com';
  const password = 'BRTransp2024!';

  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: {
      email,
      name: 'Administrador',
      password: hash,
      role: 'admin',
    },
  });

  console.log('Admin criado/atualizado:', user.email);
  console.log('Senha:', password);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
