export interface SerializedError {
	name: string;
	message: string;
	stack: string;
	[prop: string]: any;
}

export class ErrorSerializer {
  // Converts an Error into a standard object.
  static serialize(error: Error): SerializedError {
    const { message, name, stack } = error;
    return { message, name, stack, ...error };
  }

	// Converts an object into an Error instance.
	static deserialize (data: SerializedError) {
		const Factory = this.getFactory(data);

		const error = new Factory(data.message);
		Object.assign(error, data);

		return error;
	}

	// Tries to find the global class for the error name and
  // returns Error if none is found.
	private static getFactory (data: SerializedError): new (message: string) => Error {
		const name = data.name;

		if (name.endsWith("Error") && global[name]) {
			return global[name];
		}

		return Error;
	}
}

