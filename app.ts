import { cyan, green, yellow } from "colors";
import { writeFile } from "fs/promises";
import { createObjectCsvWriter } from "csv-writer";
import { unusedAssetsFilename, managementClient } from "./config";
import { name } from "./package.json";
import { AssetModels, LanguageVariantModels } from "@kontent-ai/management-sdk";

const csvFilename = unusedAssetsFilename + ".csv";
const jsonFilename = unusedAssetsFilename + ".json";

interface IUnusedAsset {
  id: string;
  title: string;
  codename: string;
  filename: string;
  url: string;
}

const run = async () => {
  console.log(green(`Starting app '${yellow(name)}'`));
  const environmentInfo = await managementClient
    .environmentInformation()
    .toPromise();

  console.log(
    `Using project '${yellow(
      environmentInfo.data.project.name
    )}' and environment '${yellow(environmentInfo.data.project.environment)}'`
  );

  console.log("Fetching all assets");
  const allAssets = await getAllAssetsAsync();
  console.log(`All ${yellow(allAssets.length.toString())} assets fetched`);

  console.log("Fetching all language variants");
  const allLanguageVariants = await getAllLanguageVariants();
  console.log(
    `All ${yellow(
      allLanguageVariants.length.toString()
    )} language variants fetched`
  );

  const unusedAssets = getUnusedAssets(allAssets, allLanguageVariants);
  console.log(
    `Found '${yellow(unusedAssets.length.toString())}' unused assets`
  );

  await storeUnusedAssetsAsync(unusedAssets);
};

function getUnusedAssets(
  assets: AssetModels.Asset[],
  languageVariants: LanguageVariantModels.ContentItemLanguageVariant[]
): IUnusedAsset[] {
  const unusedAssets: IUnusedAsset[] = [];

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
        title: asset.title ?? "n/a",
        codename: asset.codename,
        filename: asset.fileName,
        url: asset.url,
      });
    }
  }

  return unusedAssets;
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

async function getAllLanguageVariants(): Promise<
  LanguageVariantModels.ContentItemLanguageVariant[]
> {
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

  return languageVariants;
}

async function storeUnusedAssetsAsync(
  unusedAssets: IUnusedAsset[]
): Promise<void> {
  const headers: { id: string; title: string }[] = [
    { id: "id", title: "Asset Id" },
    { id: "title", title: "Title" },
    { id: "codename", title: "Codename" },
    { id: "filename", title: "Filename" },
    { id: "url", title: "Url" },
  ];

  const csvWriter = createObjectCsvWriter({
    path: csvFilename,
    alwaysQuote: true,
    header: headers,
  });

  await csvWriter.writeRecords(unusedAssets);
  console.log(`File '${yellow(csvFilename)}' successfully created`);

  await writeFile(jsonFilename, JSON.stringify(unusedAssets));
  console.log(`File '${yellow(jsonFilename)}' successfully created`);
}

run();
