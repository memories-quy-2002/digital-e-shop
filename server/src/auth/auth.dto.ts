export type RegisterUserInput = {
    username: string;
};

export type LocalRegisterUserInput = RegisterUserInput & {
    email: string;
    password: string;
};
