import { adminExport } from '@/lib/study/repository';
import { requirePermission } from '@/lib/auth';
import { studyErrorResponse } from '@/lib/study/errors';
import { studyExportCsv } from '@/lib/study/export';
import { connection } from 'next/server';

export async function GET(request: Request) {
  await connection();
  try {
    const context = await requirePermission(request, 'study-data:export');
    const data = await adminExport(context) as Record<string, unknown>;
    const format = new URL(request.url).searchParams.get('format');
    if (format === 'csv') {
      return new Response(studyExportCsv(data), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="student-study-export-${new Date().toISOString().slice(0, 10)}.csv"`,
          'cache-control': 'private, no-store',
        },
      });
    }
    return Response.json({ data }, { headers: { 'cache-control': 'private, no-store' } });
  } catch (cause) {
    return studyErrorResponse(cause);
  }
}
