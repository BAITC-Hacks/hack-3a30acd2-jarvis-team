import { NextRequest } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { api, ApiError, parseBody, rateLimit } from "@/lib/http";
import { MAX_TEAM_PHOTOS, MAX_TEAM_PHOTO_BYTES } from "@/lib/team-profile";
import { photoView } from "@/lib/team-server";

export const runtime = "nodejs";

const photoSchema = z.object({
  dataUrl: z.string().min(1, "Выберите фотографию.").max(5_333_380, "Фотография должна быть не больше 4 МБ."),
  caption: z.string().trim().max(200, "Подпись должна быть не длиннее 200 символов.").default(""),
}).strict();

async function safeImage(dataUrl: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new ApiError(400, "Выберите фотографию в формате JPG, PNG или WebP.");
  const source = Buffer.from(match[2], "base64");
  if (source.length > MAX_TEAM_PHOTO_BYTES) throw new ApiError(413, "Фотография должна быть не больше 4 МБ.");
  if (source.length === 0) throw new ApiError(400, "Файл фотографии пуст.");
  try {
    const image = sharp(source, { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || !metadata.width || !metadata.height || metadata.width * metadata.height > 16_000_000 || (metadata.pages ?? 1) > 1) {
      throw new ApiError(400, "Выберите обычную фотографию JPG, PNG или WebP размером до 16 мегапикселей.");
    }
    // Decode and re-encode instead of serving uploaded bytes or keeping private EXIF metadata.
    return await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Не удалось прочитать фотографию. Выберите JPG, PNG или WebP размером до 16 мегапикселей.");
  }
}

export async function POST(request: NextRequest) {
  return api(async () => {
    const user = await requireUser("TEAM");
    await rateLimit("team-photo", user.id, 30, 15 * 60 * 1000);
    const row = await db.team.findUnique({ where: { ownerId: user.id }, select: { id: true } });
    if (!row) throw new ApiError(404, "Профиль команды не найден.");
    const body = await parseBody(request, photoSchema, { maxBytes: 5_400_000, tooLargeMessage: "Фотография должна быть не больше 4 МБ." });
    const data = await safeImage(body.dataUrl);
    const photo = await db.$transaction(async (tx) => {
      // Acquire the SQLite write lock before counting so concurrent uploads cannot bypass the limit.
      await tx.team.update({ where: { id: row.id }, data: { updatedAt: new Date() }, select: { id: true } });
      const count = await tx.teamPhoto.count({ where: { teamId: row.id } });
      if (count >= MAX_TEAM_PHOTOS) throw new ApiError(409, `Можно добавить до ${MAX_TEAM_PHOTOS} фотографий. Удалите одну, чтобы загрузить новую.`);
      return tx.teamPhoto.create({ data: { teamId: row.id, caption: body.caption, data: new Uint8Array(data) }, select: { id: true, caption: true } });
    });
    return { photo: photoView(photo) };
  }, request);
}
