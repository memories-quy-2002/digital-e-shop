import React from "react";
import { Navbar, Container, Nav } from "react-bootstrap";
import "../../styles/NavBar.scss";

const navItems = ["shops", "hot deals", "about us", "contact us"];
const NavigationBar = () => {
    return (
        <Navbar bg="gray">
            <Container>
                <Nav className="navbar">
                    <Nav.Link href={`/`} className="navbar__item">
                        Home
                    </Nav.Link>
                    {navItems.map((item, id) => (
                        <Nav.Link
                            key={id}
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
