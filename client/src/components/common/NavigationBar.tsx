import React from "react";
import { Navbar, Container, Nav } from "react-bootstrap";
import "../../styles/NavBar.scss";

const navItems = [
	"hot deals",
	"categories",
	"laptops",
	"smartphones",
	"cameras",
	"accessories",
];
const NavigationBar = () => {
	return (
		<Navbar bg="gray">
			<Container>
				<Nav className=" me-auto navbar">
					<Nav.Link href={`/home`} className="navbar__item">
						Home
					</Nav.Link>
					{navItems.map((item) => (
						<Nav.Link
							href={`/${item.replace(" ", "-")}`}
							className="navbar__item"
						>
							{item}
						</Nav.Link>
					))}
				</Nav>
			</Container>
		</Navbar>
	);
};

export default NavigationBar;
