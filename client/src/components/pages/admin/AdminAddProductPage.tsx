import { Button, Form } from "react-bootstrap";
import AdminLayout from "../../layout/AdminLayout";

const AdminAddProductPage = () => {
    return (
        <AdminLayout>
            <div className="admin__product">
                <div className="admin__product__title">
                    <h3>ADD PRODUCT</h3>
                </div>
                <div>
                    <div className="mb-1">
                        <span className="cart__container__payment__form__required">
                            *
                        </span>{" "}
                        Required
                    </div>

                    <Form>
                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group
                                    className="mb-3"
                                    controlId="formProductName"
                                >
                                    <Form.Label>
                                        Product name{" "}
                                        <span className="cart__container__payment__form__required">
                                            *
                                        </span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter product name"
                                    />
                                </Form.Group>

                                <Form.Group
                                    className="mb-3"
                                    controlId="formDescription"
                                >
                                    <Form.Label>
                                        Description{" "}
                                        <span className="cart__container__payment__form__required">
                                            *
                                        </span>
                                    </Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        rows={5}
                                        name="address"
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group
                                    className="mb-3"
                                    controlId="formImage"
                                >
                                    <Form.Label>
                                        Image{" "}
                                        <span className="cart__container__payment__form__required">
                                            *
                                        </span>
                                    </Form.Label>
                                    <Form.Control
                                        type="file"
                                        accept="images/*"
                                    />
                                </Form.Group>
                            </div>
                        </div>

                        <div className="row">
                            <div className="col-md-6">
                                <Form.Group
                                    className="mb-3"
                                    controlId="formCategory"
                                >
                                    <Form.Label>
                                        Category{" "}
                                        <span className="cart__container__payment__form__required">
                                            *
                                        </span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter category"
                                    />
                                </Form.Group>
                                <Form.Group
                                    className="mb-3"
                                    controlId="formSubCategory"
                                >
                                    <Form.Label>
                                        Sub-category{" "}
                                        <span className="cart__container__payment__form__required">
                                            *
                                        </span>
                                    </Form.Label>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter Sub-category"
                                        required
                                    />
                                </Form.Group>
                            </div>
                            <div className="col-md-6">
                                <Form.Group
                                    className="mb-3"
                                    controlId="formSpecifications"
                                >
                                    <Form.Label>Specifications</Form.Label>
                                    <Form.Control
                                        as="textarea"
                                        rows={5}
                                        placeholder="Enter Specifications"
                                    />
                                </Form.Group>
                            </div>
                        </div>

                        <Form.Group className="mb-3" controlId="formPrice">
                            <Form.Label>Product Price</Form.Label>
                            <Form.Control
                                type="number"
                                placeholder="Enter price"
                            />
                        </Form.Group>

                        <Form.Group className="mb-3" controlId="formInventory">
                            <Form.Label>Inventory Quantity</Form.Label>
                            <Form.Control
                                type="number"
                                placeholder="Enter quantity"
                            />
                        </Form.Group>
                        <Button variant="primary" type="submit">
                            Submit
                        </Button>
                    </Form>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminAddProductPage;
