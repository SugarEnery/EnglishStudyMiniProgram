import {z} from 'zod';
export const accountProfileSchema=z.object({userId:z.string().regex(/^WS-[A-F0-9]{16}$/),nickName:z.string().max(40),hasAvatar:z.boolean(),avatarVersion:z.string().regex(/^[a-f0-9]{64}$/).nullable()}).strict();
export const profileUpdateSchema=z.object({nickName:z.string().trim().min(1).max(40)}).strict();
