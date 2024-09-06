import { Nav, Navbar } from "react-bootstrap";
import "../../styles/NavBar.scss";

const navItems = [
    "shops",
    "promotions",
    "about us",
    "contact us",
    "support",
    "news",
];
const NavigationBar = () => {
    return (
        <Navbar bg="gray">
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
        </Navbar>
    );
};

export default NavigationBar;
