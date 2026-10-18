import { DecisionError } from "../../../domain/decision-error";
import { comparePriceOffers } from "../../../domain/price-comparison";
import { createServerPriceComparisonRepository } from "../../../server/data-source/price-comparison-factory";
import { requireSession } from "../../../server/auth/session";
import { resolveDataSource } from "../../../server/data-source/configuration";
import { createServerOperatorRepository } from "../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../server/data-source/route-error";
import { limitUserRequests } from "../../../server/security/rate-limit";
import { dataSourceReadResponse } from "../../../server/data-source/read-response";

export const dynamic = "force-dynamic";
const SAFE_MATERIAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function GET(request: Request) {
  try {
    const user = await requireSession(false);
    await limitUserRequests(user, false);
    return await dataSourceReadResponse("comparison", async () => {
    if (resolveDataSource() === "operator-api") {
      return Response.json(
        { error: "PRICE_COMPARISON_UNAVAILABLE", message: "Comparação indisponível para esta fonte." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const requestedMaterialId = new URL(request.url).searchParams.get("materialId");
    if (requestedMaterialId !== null && !SAFE_MATERIAL_ID.test(requestedMaterialId)) {
      throw new DecisionError("Material oficial inválido.");
    }
    const priceRepository = createServerPriceComparisonRepository();
    const materials = await createServerOperatorRepository().listOfficialMaterials();
    let material = requestedMaterialId === null
      ? undefined
      : materials.find((entry) => entry.id === requestedMaterialId);
    let offers = material ? await priceRepository.listOffersByMaterial(material.id) : [];

    if (requestedMaterialId === null && resolveDataSource() === "sharepoint") {
      material = materials[0];
      offers = material ? await priceRepository.listOffersByMaterial(material.id) : [];
    } else if (requestedMaterialId === null) {
      for (const candidate of materials) {
        const candidateOffers = await priceRepository.listOffersByMaterial(candidate.id);
        if (candidateOffers.length) {
          material = candidate;
          offers = candidateOffers;
          break;
        }
      }
    }

    if (!material) {
      if (requestedMaterialId === null) return Response.json(null, { headers: { "Cache-Control": "no-store" } });
      return Response.json(
        {
          error: requestedMaterialId === null ? "PRICE_OFFERS_NOT_FOUND" : "MATERIAL_NOT_FOUND",
          message: requestedMaterialId === null
            ? "Nenhum material com ofertas de demonstração foi encontrado."
            : "Material oficial não encontrado.",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(comparePriceOffers(material, offers), {
      headers: { "Cache-Control": "no-store" },
    });
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
