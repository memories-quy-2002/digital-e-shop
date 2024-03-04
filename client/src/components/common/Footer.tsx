import "../../styles/Footer.scss";
const Footer = () => {
	return (
		<div className="footer">
			<div className="footer__about">
				<h5 style={{ fontWeight: "bold" }}>About us</h5>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
					do eiusmod tempor incididunt ut labore et dolore magna
					aliqua. Ut enim ad minim veniam.
				</p>
			</div>
			<div className="footer__menuGroup">
				<div className="footer__menuGroup__menu">
					<h5 className="footer__menuGroup__menu__title">
						Categories
					</h5>
					<div className="footer__menuGroup__menu__item">Laptops</div>
					<div className="footer__menuGroup__menu__item">Cameras</div>
					<div className="footer__menuGroup__menu__item">
						Smartphones
					</div>
					<div className="footer__menuGroup__menu__item">
						Accessories
					</div>
				</div>
				<div className="footer__menuGroup__menu">
					<h5 className="footer__menuGroup__menu__title">
						Information
					</h5>
					<div className="footer__menuGroup__menu__item">
						About us
					</div>
					<div className="footer__menuGroup__menu__item">
						Contact us
					</div>
					<div className="footer__menuGroup__menu__item">
						Privacy and Policy
					</div>
					<div className="footer__menuGroup__menu__item">
						Terms and Condition
					</div>
				</div>
				<div className="footer__menuGroup__menu">
					<h5 className="footer__menuGroup__menu__title">Service</h5>
					<div className="footer__menuGroup__menu__item">
						My accounts
					</div>
					<div className="footer__menuGroup__menu__item">
						Shopping cart
					</div>
					<div className="footer__menuGroup__menu__item">
						Track my order
					</div>
					<div className="footer__menuGroup__menu__item">Help</div>
				</div>
			</div>
		</div>
	);
};

export default Footer;
