import { cyan, green, yellow } from "colors";
import { writeFile } from "fs/promises";
import { createObjectCsvWriter } from "csv-writer";
import {
  unusedAssetsFilename,
  managementClient,
  duplicateAssetsFilename,
  environmentId,
} from "./config";
import { name } from "./package.json";
import {
  AssetModels,
  ContentItemModels,
  ContentTypeModels,
  ContentTypeSnippetModels,
  LanguageModels,
  LanguageVariantModels,
} from "@kontent-ai/management-sdk";

const unsedAssetsCsvFilename = unusedAssetsFilename + ".csv";
const unusedAssetsJsonFilename = unusedAssetsFilename + ".json";
const duplicateAssetsCsvFilename = duplicateAssetsFilename + ".csv";
const duplicateAssetsJsonFilename = duplicateAssetsFilename + ".json";

interface IAssetUsedIn {
  itemName: string;
  itemCodename: string;
  languageCodename: string;
  typeCodename: string;
  element: string;
}

interface IUnusedAssetCsvAndJsonRecord {
  id: string;
  title: string;
  codename: string;
  filename: string;
  url: string;
  appUrl: string;
}

interface IDuplicateAssetCsvRecord {
  sharedFilename: string;
  id: string;
  title: string;
  codename: string;
  filename: string;
  url: string;
  appUrl: string;
  usedInItemCodenames: string[];
}

interface IDuplicateAssetJsonRecord {
  sharedFilename: string;
  duplicateAssets: {
    id: string;
    title: string;
    codename: string;
    filename: string;
    url: string;
    appUrl: string;
    usedIn: IAssetUsedIn[];
  }[];
}

interface IDuplicateAssetUsage {
  asset: AssetModels.Asset;
  usedIn: IAssetUsedIn[];
}

interface IDuplicateAsset {
  sharedFilename: string;
  assets: IDuplicateAssetUsage[];
}

const run = async () => {
  console.log(green(`Starting app '${yellow(name)}'`));
  const environmentInfo = await managementClient
    .environmentInformation()
    .toPromise();

  console.log("Fetching all content types");
  const contentTypes = await (
    await managementClient.listContentTypes().toAllPromise()
  ).data.items;

  console.log("Fetching all content type snippets");
  const contentTypeSnippets = await (
    await managementClient.listContentTypeSnippets().toAllPromise()
  ).data.items;

  console.log("Fetching all languages");
  const languages = await (
    await managementClient.listLanguages().toAllPromise()
  ).data.items;

  console.log(
    `Using project '${yellow(
      environmentInfo.data.project.name
    )}' and environment '${yellow(environmentInfo.data.project.environment)}'`
  );

  console.log("Fetching all assets");
  const allAssets = await getAllAssetsAsync();
  console.log(`All ${yellow(allAssets.length.toString())} assets fetched`);

  console.log("Fetching all language variants");
  const itemsAndVariants = await getLanguageVariantsAndContentItemsAsync();
  console.log(
    `All ${yellow(
      itemsAndVariants.languageVariants.length.toString()
    )} language variants fetched`
  );

  const unusedAssets = getUnusedAssets(
    allAssets,
    itemsAndVariants.languageVariants
  );
  console.log(
    `Found '${yellow(unusedAssets.length.toString())}' unused assets`
  );

  const duplicateAssets = getDuplicateAssets(
    languages,
    contentTypes,
    contentTypeSnippets,
    itemsAndVariants.contentItems,
    allAssets,
    itemsAndVariants.languageVariants,
    unusedAssets
  );
  console.log(
    `Found '${yellow(
      duplicateAssets.length.toString()
    )}' instances of duplicate assets`
  );

  await storeUnusedAssetsAsync(unusedAssets);
  await storeDuplicateAssetsAsync(duplicateAssets);
};

function getDuplicateAssets(
  languages: LanguageModels.LanguageModel[],
  types: ContentTypeModels.ContentType[],
  typeSnippets: ContentTypeSnippetModels.ContentTypeSnippet[],
  contentItems: ContentItemModels.ContentItem[],
  assets: AssetModels.Asset[],
  languageVariants: LanguageVariantModels.ContentItemLanguageVariant[],
  unusedAssets: IUnusedAssetCsvAndJsonRecord[]
): IDuplicateAsset[] {
  const duplicateAssets: IDuplicateAsset[] = [];

  let index: number = 0;
  for (const asset of assets) {
    index++;
    console.log(
      `[${cyan(`${index}/${assets.length}`)}] Checking duplicate asset '${
        asset.fileName
      }'`
    );

    if (duplicateAssets.find((m) => m.sharedFilename === asset.fileName)) {
      continue;
    }

    const assetsWithSameFilename = assets
      .filter((m) => m.id !== asset.id)
      .filter((m) => m.fileName === asset.fileName);

    if (assetsWithSameFilename.length) {
      duplicateAssets.push({
        sharedFilename: asset.fileName,
        assets: [
          {
            asset: asset,
            usedIn: getAssetUsedIn(
              languages,
              types,
              typeSnippets,
              contentItems,
              asset,
              languageVariants
            ),
          },
          ...assetsWithSameFilename.map((assetWithSameFilename) => {
            const assetUsage: IDuplicateAssetUsage = {
              asset: assetWithSameFilename,
              usedIn: getAssetUsedIn(
                languages,
                types,
                typeSnippets,
                contentItems,
                assetWithSameFilename,
                languageVariants
              ),
            };

            return assetUsage;
          }),
        ],
      });
    }
  }

  return duplicateAssets;
}

function getAssetUsedIn(
  languages: LanguageModels.LanguageModel[],
  types: ContentTypeModels.ContentType[],
  typeSnippets: ContentTypeSnippetModels.ContentTypeSnippet[],
  contentItems: ContentItemModels.ContentItem[],
  asset: AssetModels.Asset,
  languageVariants: LanguageVariantModels.ContentItemLanguageVariant[]
): IAssetUsedIn[] {
  const usedIn: IAssetUsedIn[] = [];

  for (const languageVariant of languageVariants) {
    const language = languages.find(
      (m) => m.id === languageVariant.language.id
    );

    if (!language) {
      throw Error(
        `Invalid language item with id '${languageVariant.language.id}'`
      );
    }

    const contentItem = contentItems.find(
      (m) => m.id === languageVariant.item.id
    );

    if (!contentItem) {
      throw Error(`Invalid content item with id '${languageVariant.item.id}'`);
    }
    const contentType = types.find((m) => m.id === contentItem.type.id);

    if (!contentType) {
      throw Error(`Invalid type with id '${contentItem.type.id}'`);
    }

    for (const element of languageVariant.elements) {
      let contentTypeElement = contentType.elements.find(
        (m) => m.id === element.element.id
      );

      if (!contentTypeElement) {
        for (const snippet of typeSnippets) {
          const snippetElement = snippet.elements.find(
            (m) => m.id === element.element.id
          );

          if (snippetElement) {
            contentTypeElement = snippetElement;
            continue;
          }
        }
      }

      if (!contentTypeElement) {
        throw Error(
          `Invalid element with id '${element.element.id}' in type '${contentType.name}'`
        );
      }

      const jsonValue = JSON.stringify(element.value);
      if (
        jsonValue?.toString()?.toLowerCase()?.includes(asset.id.toLowerCase())
      ) {
        // asset is used in this element
        usedIn.push({
          element: contentTypeElement.codename ?? "",
          languageCodename: language.codename,
          itemCodename: contentItem.codename,
          itemName: contentItem.name,
          typeCodename: contentType.codename,
        });
      }
    }
  }

  return usedIn;
}

function getUnusedAssets(
  assets: AssetModels.Asset[],
  languageVariants: LanguageVariantModels.ContentItemLanguageVariant[]
): IUnusedAssetCsvAndJsonRecord[] {
  const unusedAssets: IUnusedAssetCsvAndJsonRecord[] = [];

  let index: number = 0;
  for (const asset of assets) {
    index++;
    console.log(
      `[${cyan(`${index}/${assets.length}`)}] Checking unused asset '${
        asset.fileName
      }'`
    );
    let assetUsed: boolean = false;
    for (const item of languageVariants) {
      for (const element of item.elements) {
        if (element.value) {
          const jsonValue = JSON.stringify(element.value);
          if (
            jsonValue
              ?.toString()
              ?.toLowerCase()
              ?.includes(asset.id.toLowerCase())
          ) {
            assetUsed = true;
          }
        }
      }
    }

    if (!assetUsed) {
      unusedAssets.push({
        id: asset.id,
        title: asset.title ?? "",
        codename: asset.codename,
        filename: asset.fileName,
        url: asset.url,
        appUrl: getAssetAppUrl(asset),
      });
    }
  }

  return unusedAssets;
}

function getAssetAppUrl(asset: AssetModels.Asset): string {
  return `https://app.kontent.ai/${environmentId}/content-inventory/assets/asset/${asset.id}`;
}

async function getAllAssetsAsync(): Promise<AssetModels.Asset[]> {
  return (
    await managementClient
      .listAssets()
      .withListQueryConfig({
        responseFetched: (response) => {
          console.log(
            `Fetched '${yellow(response.data.items.length.toString())}' assets`
          );
        },
      })
      .toAllPromise()
  ).data.items;
}

async function getLanguageVariantsAndContentItemsAsync(): Promise<{
  languageVariants: LanguageVariantModels.ContentItemLanguageVariant[];
  contentItems: ContentItemModels.ContentItem[];
}> {
  const languageVariants: LanguageVariantModels.ContentItemLanguageVariant[] =
    [];

  const items = await managementClient
    .listContentItems()
    .withListQueryConfig({
      responseFetched: (response, token) => {
        console.log(
          `Fetched '${yellow(
            response.data.items.length.toString()
          )}' content items`
        );
      },
    })
    .toAllPromise();

  let index = 0;
  for (const item of items.data.items) {
    index++;
    const langaugeVariantsOfItem = (
      await managementClient
        .listLanguageVariantsOfItem()
        .byItemCodename(item.codename)
        .toPromise()
    ).data.items;
    languageVariants.push(...langaugeVariantsOfItem);

    console.log(
      `[${cyan(`${index}/${items.data.items.length}`)}] Fetched '${yellow(
        langaugeVariantsOfItem.length.toString()
      )}' variants for item '${item.codename}'`
    );
  }

  return {
    languageVariants: languageVariants,
    contentItems: items.data.items,
  };
}

async function storeUnusedAssetsAsync(
  unusedAssets: IUnusedAssetCsvAndJsonRecord[]
): Promise<void> {
  const headers: { id: string; title: string }[] = [
    { id: "id", title: "Asset Id" },
    { id: "title", title: "Title" },
    { id: "codename", title: "Codename" },
    { id: "filename", title: "Filename" },
    { id: "url", title: "Url" },
    { id: "appUrl", title: "App Url" },
  ];

  const csvWriter = createObjectCsvWriter({
    path: unsedAssetsCsvFilename,
    alwaysQuote: true,
    header: headers,
  });

  await csvWriter.writeRecords(unusedAssets);
  console.log(`File '${yellow(unsedAssetsCsvFilename)}' successfully created`);

  await writeFile(unusedAssetsJsonFilename, JSON.stringify(unusedAssets));
  console.log(
    `File '${yellow(unusedAssetsJsonFilename)}' successfully created`
  );
}

async function storeDuplicateAssetsAsync(
  duplicateAssets: IDuplicateAsset[]
): Promise<void> {
  const headers: { id: string; title: string }[] = [
    { id: "sharedFilename", title: "Shared filename" },
    { id: "id", title: "Asset Id" },
    { id: "title", title: "Title" },
    { id: "codename", title: "Codename" },
    { id: "filename", title: "Filename" },
    { id: "url", title: "Url" },
    { id: "appUrl", title: "App Url" },
    { id: "usedInItemCodenames", title: "Used in item codenames" },
  ];

  const duplicateAssetCsvRecords: IDuplicateAssetCsvRecord[] = [];

  for (const record of duplicateAssets) {
    for (const assetRecord of record.assets) {
      duplicateAssetCsvRecords.push({
        sharedFilename: record.sharedFilename,
        id: assetRecord.asset.id,
        title: assetRecord.asset.title ?? "",
        codename: assetRecord.asset.codename,
        filename: assetRecord.asset.fileName,
        url: assetRecord.asset.url,
        appUrl: getAssetAppUrl(assetRecord.asset),
        usedInItemCodenames: assetRecord.usedIn.map((usedIn) => {
          return `${usedIn.itemCodename}`;
        }),
      });
    }
  }
  duplicateAssets.map((duplicateRecord) => {
    return {
      sharedFilename: duplicateRecord.sharedFilename,
      assetIds: duplicateRecord.assets.map((m) => m.asset.id),
      appUrls: duplicateRecord.assets.map((m) => getAssetAppUrl(m.asset)),
      urls: duplicateRecord.assets.map((m) => m.asset.url),
    };
  });

  const duplicateAssetJsonRecords: IDuplicateAssetJsonRecord[] =
    duplicateAssets.map((duplicateRecord) => {
      const jsonItem: IDuplicateAssetJsonRecord = {
        sharedFilename: duplicateRecord.sharedFilename,
        duplicateAssets: duplicateRecord.assets.map((m) => {
          return {
            id: m.asset.id,
            title: m.asset.title ?? "",
            codename: m.asset.codename,
            filename: m.asset.fileName,
            url: m.asset.url,
            appUrl: getAssetAppUrl(m.asset),
            usedIn: m.usedIn,
          };
        }),
      };
      return jsonItem;
    });

  const csvWriter = createObjectCsvWriter({
    path: duplicateAssetsCsvFilename,
    alwaysQuote: true,
    header: headers,
  });

  await csvWriter.writeRecords(duplicateAssetCsvRecords);
  console.log(
    `File '${yellow(duplicateAssetsCsvFilename)}' successfully created`
  );

  await writeFile(
    duplicateAssetsJsonFilename,
    JSON.stringify(duplicateAssetJsonRecords)
  );
  console.log(
    `File '${yellow(duplicateAssetsJsonFilename)}' successfully created`
  );
}

run();
