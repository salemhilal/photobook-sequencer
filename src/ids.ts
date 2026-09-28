/**
 * Ids for each kind of thing in a project. They're strings, but branded, so one kind
 * can't be passed where another is expected (a spread's id for a photo's, say), and a
 * plain string can't stand in for either without saying so: `toPhotoId(s)`, used only
 * where ids come from outside (a file, the DOM, a URL), or a fresh one from `newPhotoId()`.
 */

declare const photoIdBrand: unique symbol;
declare const spreadIdBrand: unique symbol;
declare const guideIdBrand: unique symbol;

export type PhotoId = string & { readonly [photoIdBrand]: true };
export type SpreadId = string & { readonly [spreadIdBrand]: true };
/** A border guide's or a line guide's. */
export type GuideId = string & { readonly [guideIdBrand]: true };

export const toPhotoId = (s: string) => s as PhotoId;
export const toSpreadId = (s: string) => s as SpreadId;
export const toGuideId = (s: string) => s as GuideId;

export const newPhotoId = () => toPhotoId(crypto.randomUUID());
export const newSpreadId = () => toSpreadId(crypto.randomUUID());
export const newGuideId = () => toGuideId(crypto.randomUUID());
