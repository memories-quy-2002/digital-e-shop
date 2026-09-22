import type { ProductWithAttributes } from "../api";
import { useT } from "../../../hooks/useT";
import type { ComparisonMatrixRow } from "../compare/types";

type ComparisonTableProps = {
    products: ProductWithAttributes[];
    rows: ComparisonMatrixRow[];
};

const ComparisonTable = ({ products, rows }: ComparisonTableProps) => {
    const t = useT();

    return (
        <div
            className="comparison-table__viewport"
            role="region"
            aria-labelledby="comparison-table-heading"
            tabIndex={0}
        >
            <table className="comparison-table" aria-labelledby="comparison-table-heading">
                <caption id="comparison-table-heading">{t("comparison.specifications")}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t("comparison.specifications")}</th>
                        {products.map((product) => (
                            <th scope="col" key={product.id}>
                                {product.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.key} className={row.isDifferent ? "comparison-table__row--different" : undefined}>
                            <th scope="row">
                                <span>{row.label}</span>
                                {row.unit ? <small>{row.unit}</small> : null}
                            </th>
                            {products.map((product) => (
                                <td key={product.id}>
                                    {row.values[String(product.id)] || t("comparison.missingValue")}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ComparisonTable;
