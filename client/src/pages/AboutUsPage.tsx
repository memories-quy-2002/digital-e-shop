import React from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import heroImage from "../assets/images/about_us.jpg";
import Layout from "../components/layout/Layout";
import { PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../utils/images";
import { useT } from "../hooks/useT";
import "../styles/pages/_about.scss";

const AboutUsPage: React.FC = () => {
    const t = useT();
    const heroImageSource = getResponsiveImageSource(heroImage, {
        widths: PAGE_IMAGE_WIDTHS,
        sizes: "(min-width: 1024px) 42vw, 92vw",
        fit: "fill",
    });

    const values = (t("about.values") as unknown as Array<{ title: string; desc: string }>).map(
        (value) => ({
            title: value.title,
            desc: value.desc,
        }),
    );

    const milestones = t("about.milestones") as unknown as Array<{ year: string; text: string }>;

    const teams = (t("about.team") as unknown as Array<{ name: string; detail: string }>).map(
        (team) => ({
            name: team.name,
            detail: team.detail,
        }),
    );

    return (
        <Layout>
            <Helmet>
                <title>{`${t("about.title")} | Digital-E`}</title>
                <meta
                    name="description"
                    content="Learn more about Digital-E, our mission, and how we build a trusted electronics shopping experience."
                />
            </Helmet>
            <main className="about info-page">
                <section className="about__hero">
                    <div className="about__hero__content">
                        <h1>{t("about.title")}</h1>
                        <p>{t("about.subtitle")}</p>
                        <div className="about__hero__actions info-page__actions">
                            <Link to="/shops">{t("about.explore")}</Link>
                            <Link to="/support" className="ghost">
                                {t("about.getSupport")}
                            </Link>
                        </div>
                    </div>
                    <div className="about__hero__media">
                        <img
                            src={heroImageSource.src}
                            srcSet={heroImageSource.srcSet}
                            sizes={heroImageSource.sizes}
                            alt="Digital-E mobile technology selection"
                            loading="eager"
                            fetchPriority="high"
                            decoding="async"
                        />
                    </div>
                </section>

                <section className="about__stats" aria-label="Digital-E operating snapshot">
                    <div>
                        <strong>5K+</strong>
                        <span>{t("about.stats.products")}</span>
                    </div>
                    <div>
                        <strong>120+</strong>
                        <span>{t("about.stats.brands")}</span>
                    </div>
                    <div>
                        <strong>24/7</strong>
                        <span>{t("about.stats.support")}</span>
                    </div>
                    <div>
                        <strong>UTC</strong>
                        <span>{t("about.stats.orderTime")}</span>
                    </div>
                </section>

                <section className="about__values">
                    <div className="about__section-heading info-page__section-heading">
                        <h2>{t("about.principlesHeading")}</h2>
                    </div>
                    <div className="about__values__grid">
                        {values.map((value, index) => (
                            <article className="about__values__card" key={value.title}>
                                <small>{String(index + 1).padStart(2, "0")}</small>
                                <h3>{value.title}</h3>
                                <p>{value.desc}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="about__story">
                    <div className="about__story__content">
                        <h2>{t("about.missionHeading")}</h2>
                        <p>{t("about.missionText")}</p>
                    </div>
                    <div className="about__story__milestones">
                        {milestones.map((milestone) => (
                            <article key={milestone.year}>
                                <strong>{milestone.year}</strong>
                                <p>{milestone.text}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="about__team">
                    <div className="about__section-heading info-page__section-heading">
                        <span>{t("about.teamHeading")}</span>
                        <h2>{t("about.teamSubtitle")}</h2>
                    </div>
                    <div className="about__team__grid">
                        {teams.map((team) => (
                            <article className="about__team__card" key={team.name}>
                                <h3>{team.name}</h3>
                                <p>{team.detail}</p>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default AboutUsPage;
