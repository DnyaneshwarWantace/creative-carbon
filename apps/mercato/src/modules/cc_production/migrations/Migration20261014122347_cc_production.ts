import { Migration } from '@mikro-orm/migrations';

export class Migration20261014122347_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" add "certificate" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_lab_tests" drop column "certificate";`);
  }

}
